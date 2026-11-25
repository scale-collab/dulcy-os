# Ingest: Alex's "2-Hour Cold Email Campaign SOP" (full read, for Scribe)

- **Source:** `sops/drive-export/001-X---2-Hour-Cold-Email-Campaign-SOP.md` (7,754 lines, ~346 KB). Drive export of 2026-11-17, doc modified 2026-11-07. The export itself says "not independently validated as current".
- **Read:** 2026-11-25, every line. Lines are cited as `L123` so anyone can check the wording.
- **How to use this file:** sections 1-3 and 5 are the rules. Read those first. Section 4 is the swipe file (about 250 examples, verbatim, labelled) and section 6 holds the prompts. Both are long on purpose, for lookup.
- **Precedence:** `rules/RULES.md` wins over this SOP (see section 7). The SOP is Alex's swipe file plus process notes. Most example emails were written by other agencies or creators, for their own clients.
- **Coverage note:** the doc repeats itself. The Template Library appears 3 times (L2224, L3911, L6463). The copywriter prompt plus guide appear twice (L1840, L5462). The offer/index block appears 3 times (L2897, L4619, L7136). I checked each repeat line by line against the first copy, ignoring whitespace. The only new material in the repeats is the Lead FLO Marketing onboarding record (L4813-L5459, repeated at L5803-L6462), the Make/n8n webhook list (L4788-L4806) and the Sheets formulas (L4736-L4787). One line changed in the third offer block: the "Print & Direct Mail" bullet is nested differently. Everything else is a copy. This file quotes each item once.
- **SECURITY:** the SOP export holds plaintext client credentials for Lead FLO Marketing: a LinkedIn password (L5029-5030 and L6019-6020), a 2FA secret (L5047-5048 and L6037-6038) and a `ci_password` (L5148-5149 and L6138-6139). It also holds live Make webhook URLs (L4794, L4798). This breaks RULES.md 2026-11-17 ("Never include keys, tokens, passwords ... in this repo"). None of them are copied here. Flag this to Alex: the export needs redacting and the credentials rotating.

---

## 0. Map of the source

| Lines | What it is | Copy relevance |
|---|---|---|
| L1-704 | The 2-hour SOP itself: steps 1-9, hard rules, launch steps, 2 reusable templates, time targets | Core process |
| L715-1005 | Guide "HOW TO WRITE HIGH-CONVERTING COLD EMAIL COPY IN 2026": curiosity + trust, 3 dream outcomes, 3 proof types, 2 structures, CTA types, 3 campaign case studies, principles table, checklist | Core copy theory |
| L1010-1013 | Triple Tap Framework | Core copy rules |
| L1022-1080 | "First Lines" / "Second Lines" swipe | Examples |
| L1081-1209 | "CLIENT MASTER DOCUMENT" notes: 10-year-old test, offer > copy, 5 questions, proof types again, the "secondhand leads" reframe | Copy theory |
| L1217-1390 | Swipe emails (TBPN, search bar, reactivation, Kubernetes, creator, Dallas, med spa, data waterfall, promotion), 5 offer questions, front/back/cold offer definitions | Examples + offer theory |
| L1403-1444 | 3 "Model Examples" plus a breakdown | Examples |
| L1452-1510 | MCA conversation: "That's not an offer. That's a company bio." | Offer theory |
| L1507-1564 | Reddit language mining, 3 layers of pain | Research method |
| L1569-1584 | Calls → top-3 pains → lead magnets | Research method |
| L1586-1645 | Top off / new vertical / new offer table | Next campaign |
| L1646 | Transcript of the guide video (one long line) | Theory + extra details |
| L1649-1693 | Newsletter "Each campaign should improve the next one" + Claude prompt | Next campaign + prompt |
| L1698-1735 | Newsletter "What your buyer needs to hear" (Ikeuchi, another agency's client) | Segment language method |
| L1738-1837 | 100 one-line cold offers | Examples |
| L1840-2214 | Copywriter prompt: role, guide, Triple Tap, Rules, Input Data, Thesis | **Main prompt** |
| L2224-2893 | Cold Email Template Library: 00 Frameworks + 01 Master Templates | Examples + rules |
| L2897-3006 | 02 Offer-Specific Index, 03 Niche Index | Index |
| L3009-3268 | 03 Offer Examples (MCA, Nick Abraham threads, gift cards, AirPods math, branded calling) | Offer theory + examples |
| L3271-3462 | 04 Lead magnet levels, offer ideas by service, "Offer Introduction" guarantee statements by niche | Offers |
| L3463-3508 | Script Templates: Base 1, Base 2, Ultimate sequence, personalisation list | Frameworks |
| L3511-3515 | 99 Archive Recommendations (what is bad) | Bad-copy rules |
| L3516-3524 | Spintax prompt | **Prompt** |
| L3529-3691 | List prompts: /DEEP 10 domains, DiscoLike ICP description, list usability | Prompts (Scout) |
| L3692-3852 | "Here's the prompt we use": enterprise copy prompt | **Prompt** |
| L3853-3908 | HeyReach LinkedIn message scripts | LinkedIn (channel not working now) |
| L4736-4806 | Deliverability cheatsheet link, Sheets formulas, webhook list | Not copy |
| L4813-5459 | Lead FLO Marketing onboarding record, offer sheet, thesis (Dulcy client) | Client-specific example of inputs |

---

## 1. Hard rules for copy

Everything below is quoted from the SOP. Where RULES.md overrides it, that is marked **RULES WINS**. Section 7 has the full conflicts list.

### 1.1 What Scribe should actually apply (SOP + RULES, merged)

1. **Length:** 30-75 words per email (SOP core). Triple Tap adds max 3-4 sentences. Other parts of the SOP say otherwise (see 1.2).
2. **One of each:** one ICP, one pain, one proof-backed promise, one solution, one CTA per email.
3. **Proof:** **RULES WINS:** "at least 1 strong proof per email. More is better, as long as every extra proof is just as strong (no filler proof)" (RULES 2026-11-25). The SOP says "at least 2".
4. **Ask:** **RULES WINS:** "a call can be asked for, but not in the cold sequence unless it is the only logical next step. Default to a low-friction ask that needs a one-word reply". This matches Triple Tap: "answerable in one word. No links. No 'book a call.'"
5. **Testing:** **RULES WINS:** "one direction per campaign (one thesis), with **2 angles** of Email 1 that test something that makes a real difference ... Never trivial word swaps". The SOP says draft 3-5 and ship one.
6. **Follow-ups never bring a new offer.**
7. **No invented facts:** RULES non-negotiable 3 applies. Every number, name and city in the SOP examples is somebody else's or a placeholder.
8. **Approval:** Scribe output is review-only. Alex approves the final copy and list, then the client approves the copy (RULES 2026-11-25). The SOP prompt's "Do NOT ask for review or approval" means only "don't stop mid-draft to ask".

### 1.2 Word and sentence counts

| Rule (exact wording) | SOP section | Line |
|---|---|---|
| "Write a maximum of 3-5 versions. Rule: - one problem - one proof - one CTA - 30–75 words" | 3. Write Step 1 in 20 minutes | L85-92 |
| "Is the email 30–75 words?" | 5. Run the checklist > Structure | L203 |
| "30–75 words is your target length / Easily scannable. Every word earns its place. Long emails lose readers before they reach the CTA." | Guide > Key Principles & Rules of Thumb | L960-961 |
| "Write the body (max 3–4 sentences)." | Triple Tap Framework > Second Tap | L1012 |
| "Max total words per email: 75. / Minimum total words per email: 30." | Prompt > Rules | L2154-2155 |
| "Address all 5 in under 50 words or get fucked." | Client Master Document notes | L1131 |
| "Most of our emails are most successful are between 30 and 70 words. I don't even think they go above 75 most of the time." | Video transcript | L1646 |
| "Length cap: Each email must be < 70 words (target 30 / 45 / 60 word bands)." | Enterprise prompt > Scriptwriting Fundamentals | L3721 |
| "If ~30 words, it should be primarily a single sharp question with one line of context. / If >30 words, apply the fundamentals above and keep flow natural (no choppy "telegram" style)." | Enterprise prompt | L3743-3746 |
| "25–69 words per script (strict)." | Enterprise prompt > Quality Standards & Guardrails | L3824 |
| "Brevity/clarity rule: If a short line feels stilted or vague, do not ship it—choose the 45- or 60-word band for natural flow." | Enterprise prompt | L3831 |
| "Brevity vs clarity: Do not sacrifice clarity for shortness." | Enterprise prompt | L3740 |
| "Make scripts as short and simple as possible without losing the core value." | Template Library > Writing Rules / Training Notes | L2330 |
| "Cut out any words that don't provide value to the email." | Prompt > Rules | L2173 |
| Structural element sizes: "Personalized Hook (8–12 words) / Social Proof Bridge (15–20 words) / Value Proposition (10–15 words) / Front-End Offer (8–12 words) / Soft CTA (5–8 words; question-based, never a hard call ask)" | Enterprise prompt > 3) Structural Elements | L3772-3776 |

### 1.3 One problem, one solution, one offer

- "Rule: - one problem - one proof - one CTA" (3. Write Step 1, L88-91).
- "Ship: - one ICP - one pain - one proof - one CTA - one clean list / No more tinkering." (9. Launch in 5 minutes, L490-498).
- "One solution per email / You can't ask a stranger to trust you with everything. Pick one specific problem, attach one specific solution." (Guide > Key Principles, L964-965).
- "Why it works: You can only sell a single solution in a cold email. The question helps you frame ONE problem and attach ONE specific offer to it." (Guide > Structure 1, L847).
- "Do not blend them unless you have a very good reason." (2. Pick one structure, L76). This means the two structures.
- "Do not test five ideas in one campaign." (Hard rules > Rule 3, L516).
- "Do not write copy while the ICP is still fuzzy." (Hard rules > Rule 1, L508).
- "Do not build a perfect contact list before the message is clear." (Rule 2, L512).

### 1.4 CTA rules

- "End with a low-friction CTA answerable in one word. No links. No "book a call." No friction." (Triple Tap > Third Tap, L1013).
- "Is there exactly one CTA?" (Checklist > Structure, L202). "Is there exactly ONE clear CTA?" (Guide checklist, L994).
- "One CTA only / Multiple asks create friction and confusion. Make it effortless to say yes." (Guide > Key Principles, L962-963).
- "Is the ask small enough?" (8. Final send check, L475).
- CTA types (Guide > CTA Types, L875-884): "Interest-based: "Would you be interested in..." / "Is this worth a quick chat?" | Resource-based: Loom video, audit, lead magnet, breakdown | Permissionless: Deliver value upfront (a custom CSV, an audit result) and ask if they want to go deeper".
- "Soft/value CTA only: Question-based CTAs that invite low-friction next steps (e.g., "Worth a quick look?")." (Enterprise prompt, L3727). "CTAs remain soft: e.g., "Would it make sense to...", "Open to exploring...", "Worth a peek?"" (L3783).
- "Make the CTA a non-decision. / "Want me to set it up? Takes 30 seconds and it's free." / Not asking for a demo or sending a calendar link." (03 Offer Examples > Nick Abraham thread, L3117-3123).
- "5/ Does replying feel easier than ignoring? (If no → remove friction)" (offer questions, L1373).
- **Too generic (BAD):** "stand-alone 'Interested?' and 'Worth a chat?'" (99 Archive Recommendations, L3512).
- CTA bank tiers Hard / Soft / Softest and the Top 16 shortlist are quoted verbatim in section 4.10. Per RULES and Triple Tap, prefer **Softest/Soft**. Hard call asks are only for when a call is the only logical next step.
- RULES adds: when a prospect replies interested, offer two dated times and no calendar link. That is Echo's job, not Scribe's.

### 1.5 Subject lines

- "Write a subject line that sparks curiosity, sounds like a vendor or client email, and never feels salesy." (Triple Tap > First Tap, L1011).
- "1) Subject Line Rules / Always 1–3 words. / Provide exactly 3 variations in spintext format: {Option1|Option2|Option3}. / Variations must include one 1-word, one 2-word, one 3-word line. / No punctuation. Curiosity- or benefit-driven." (Enterprise prompt, L3752-3756). "No emojis. No punctuation in subject lines." (L3828).
- "Subject line: demand gen / This looks more like an internal email than a marketing-related subject line" (annotated promotion example, L1346-1347).
- "Subject: [Cultural reference baked into subject line]" (Guide > Campaign 3, L936).
- Subject Line Types (Template Library > 00 Frameworks, L2249-2253): Desired Outcome / Pain / Reference / Curiosity. Examples are at L2254-2269 (verbatim in 4.10).
- Reddit: "Build a language bank - real phrases you drop into subject lines, openers, and CTAs" (L1549).
- Note: several library subject examples contain punctuation ("{FIRST_NAME}?", "re:[your service]", "{RESTAURANT}'s food - yes or no?"). That conflicts with "No punctuation" (section 7).

### 1.6 Spintax

- 2-hour SOP: "### SPINTAX IT / Prompt - X - # 2-Hour Cold Email Campaign SOP" (L164-167). This is a step after uploading scripts.
- Spintax prompt (verbatim in 6.2), key rules: "Spintax uses curly brackets { } to enclose different options ... and the pipe symbol | to separate each option." / "each choice or words or phrase must be compatible with every other choice so all phrases must be able to be combined randomly not just 1,1,1 2,2,2 but 1,3,2 and 1,2,1 etc. Ensure that all variations make grammatical sense. Do not spintax any word that contains a {} (ex. {FIRST_NAME} or {COMPANY}). Keep spintax variants on a conversational level. / Use no more than 4 examples of spintax in each sentence" (L3517-3523).
- The signature block spins the closer: "{Best regards|Kind regards|Warm regards|Sincerely|Thank you|Thanks|Yours truly|With best wishes|Best wishes|Warm wishes}," and the P.S.: "{P.S|P.s.|p.s.}" (L171, L179).
- Subject lines come as 3 spintext options (enterprise prompt, L3754).
- Library examples use double-brace spintax with an empty option: "{{ |Hi|Hey|Hello}} {{firstName}}" (L2736), "{{Hey|Hi|Hello}} {{firstName}}" (L2742).
- RULES: "Copy: no spintax in client-facing text, no manual signature. Do not spin variables like {FIRST_NAME}." (2026-11-17). Also "it builds everything (list, contacts, verify, QA, copy, spintax, build)" (2026-11-24). Read together: spintax is added at build time, but the copy shown to the client for approval has none. Treat that reading as UNKNOWN until Alex confirms (section 7, C6).

### 1.7 Variables

- "Always personalize with recipient's first name if available. / Use these variables: `{FIRST_NAME}` for the prospect's first name / `{COMPANY}` for the company name" (Prompt > Rules, L2156-2159).
- "Do not insert real names or companies. Use variables only." (L2163).
- "Map data provided by the user naturally, **only if relevant**. / Ignore irrelevant fields." (L2170-2171).
- "Make sure all variables including linkedIn are implemented." (Launch steps, L563).
- Signature variables: "{SENDER_FULL_NAME} / {ROLE}, {CLIENT COMPANY} / {WEBSITE}(.)io" (L172-174).
- Enterprise prompt: "Email Body (use {{variables}} as needed)" and "Clay Variables Needed (list): {{first_name}}, {{company_name}}, {{persona_role}}, {{industry}}, {{recent_news}}, {{tech_stack}}, {{primary_kpi}}, {{core_system}}, {{peer_company}}, {{pqs_trigger}} (include only those actually used)." Also "All {{variables}} must be valid, consistently named, and Clay-merge-safe." (L3813, L3819-3820, L3825).
- Merge-field personalisation examples: DiscoGen keywords ("It bids on keywords like dental practice purchase, start a dental practice, dental practice valuation.", L3109). The prospect's own phone number as a merge field (L3245-3251). `{{tucky pit vipers}}`, `{{dance studios}}`, `{{Santa Ana area}}`, `{{Dennis Tran...}}` inside real swipe emails (L1056, L1059).
- The library mixes syntaxes: `{FIRST_NAME}`, `{FIRSTNAME}`, `{{firstName}}`, `{{first name}}`, `FNAME`, `[name]`, `&signature%`, and a typo `{[company_name}}` (L4082). The syntax EmailBison expects is **UNKNOWN** from this SOP.
- RULES adds: Build Campaign stops if a {variable} in the copy is empty for any lead. Every enriched variable needs a fallback phrase that fits the copy (e.g. a city becomes "your area"), never blank or "Not Found" (2026-11-21, 2026-11-24).

### 1.8 Style and banned phrases

From Prompt > Rules (L2160-2173), exact:
- "Use a natural, conversational tone that matches the target market."
- "Avoid buzzwords, overpromises, or bait-and-switch."
- "Never mention the "Triple Tap" formula or any fomrula."
- "Do NOT use euphoric words."
- "NEVER use phrases like "this isn't just" or "it's not just"."
- "Use only **short dash with spaces** like this: ` - ` (not long dashes)."
- "Avoid semicolons or excessive punctuation."
- "Never say "I am following up" or terms similar."
- "Cut out any words that don't provide value to the email."

Other style rules:
- "Use a 6th-grade reading level." (Triple Tap, L1012). "Keep scripts below a 3rd-grade reading level when possible." (Library > Writing Rules, L2329). "Always confirm each script is below 3rd grade reading level. Run this into Chatgpt and say make this script as short and simple as possible without losing its core value." plus the link `https://hemingwayapp.com/` (Script Templates, L3467-3470).
- "KEEP IT SIMPLE AND CONVERSATIONAL" (Client Master Document, L1083).
- "Two tests for copy: Can a 10-year-old understand what you're selling? Would you actually say this to someone in person?" (L1087).
- "Make sure the dream outcome is presented in plain language — not just numbers and stats." (Guide, L776).
- "Personality and humor differentiate / Outside of stronger data/proof, your own voice is your biggest differentiator. Infuse it deliberately." (Guide > Key Principles, L972-973).
- "Tone: Short, conversational, professional—not slangy or too casual." / "Zero fluff. Every sentence must earn its place and advance relevance or value." (Enterprise prompt, L3715-3718). "Use plain language; avoid jargon unless in Hyper-specific tier where it improves trust." / "No emojis." (L3826-3828).
- "It needs to sound like you're talking to someone at a bar. Repeating the buyer's words matters, but forcing terminology into a sentence makes the offer harder to follow." (Ikeuchi newsletter > Read it out loud, L1734).
- "Most cold email sounds like it was written by someone who read a case study about your industry once. / Vague pain. Generic outcomes. Language that could describe literally any company in your space." (L1507-1508).
- 99 Archive Recommendations, the **banned patterns** (L3512-3515): "Too Generic: 'If we could help generate 1-5 clients…', broad 'We help X get Y in Z time', stand-alone 'Interested?' and 'Worth a chat?' / Too Hype / Risky: extreme guarantees, oversized revenue claims, blanket vertical promises without proof / Duplicate Concepts: repeated 'mind if I send a video?', repeated 'not sure if this is for you', repeated 'we helped case study', repeated 'can I send a doc?' / Needs Rewrite: anything that feels botty, vague, or built around unbelievable guarantees instead of a grounded observation or proof point".
- Note: the SOP's own example lines use long dashes "—" (e.g. L1026, L1044). Rewrite them with " - " when you adapt them.

### 1.9 Proof

- Campaign definition: "Proof: one client, one source, or one specific insight" (1. Define the campaign, L26).
- "Rule: ... one proof" (3. Write Step 1, L90). "Ship: ... one proof" (9. Launch, L493).
- Checklist > Trust (L194-197): "Are there at least 2 proof elements? / Does the proof reinforce the exact dream outcome? / Is the source / brand actually meaningful to the reader?"
- "Aim to include two proof elements per email." (Guide > The Two Email Structures, L833). "Two proof elements per email / Enough to answer 'Is it valuable?' and 'Can they deliver it?' without overwhelming." (L966-967).
- "Proof must match the dream outcome / Irrelevant proof kills trust. Every proof element should reinforce the specific outcome you're promising." (L968-969).
- "Authority must match the recipient's world / Citing a niche cold email expert to a CMO audience = wasted credibility. Always ask: does this person know this source?" (L970-971).
- Three proof types (Guide > Part 2, L783-790): "Social Proof: "I did the thing." ... The more specific the similarity, the more powerful it lands. / Third-Party Authority: "They found it." — A credible external source (Google, a major publication, a known figure in their world) validates what you're offering. / Knowledge as Proof: "I know this about you specifically." — You demonstrate research or niche expertise".
- Layering similarity: "Same industry / Same size sales team / Also a solo founder / Also their first startup they wanted to exit / We helped them exit / Every layer of similarity adds another reason to believe." (L794-800). Also: ""We helped a SaaS company" is weak. "We helped a 15-person B2B SaaS selling to mid-market HR teams" is strong. Stack the specificity: same industry, same team size, same stage, same problem." (L1161).
- Third-party authority: "Use this when you don't yet have your own social proof. It makes the VALUE of what you do undeniable — before you've even proven you can deliver it." (L809). "When your offer is ahead of the market's awareness, use third-party authority to validate the CATEGORY before pitching your solution." (L931).
- "the more specific your proof, the less selling you have to do" (L1179). "your offer is fine, your evidence isn't" (L1149). "everyone can pitch a dream outcome but almost no one makes a skeptical buyer think "ok that could actually work for us"" (L1152).
- "Include credibility (case studies, clients, proof)." (Prompt > Rules, L2162).
- "Social proof: If used, it must be hyper-relevant to the persona/vertical (same role, similar company size, adjacent tech stack, or near-neighbor use case)." / "Proof rigor: Social proof must be adjacent (same role/region/size/stack). Pains must be current and role-true." (Enterprise prompt, L3733, L3829).
- Transcript: "You can lead with offer and just do a CTA. This is my preference because I think most proof that is like social proof kind of thing isn't doing a great job in the early stages of speaking to a prospect." (L1646). **RULES WINS:** at least 1 strong proof per email.
- Trust can come from outside the email: "Sometimes trust is earned outside the email — prospects Google you." (L742).
- **RULES WINS on what counts as proof:** only verified, approved facts for *this* client (non-negotiable 3; RULES 2026-11-17 "Do not state client counts, results or proof that are not verified"). The SOP's own headline claims are not Dulcy proof. "$220,000+ in revenue", "1,326 cold email campaigns", "almost 200 calls in the first ... 70 days" and "Leadbird" come from other people's content. Never use them as Dulcy results.

### 1.10 Offers

- "98% of the effectiveness of a cold email has NOTHING to do with what is written inside the email, but the actual concept of the thing you're selling. / A winning offer beats every "hack" & "trick" you've ever read about." (L1093-1096).
- "0 personalization + 10/10 offer beats 10/10 personalization + 6/10 offer." (L1134).
- "Offer is everything. Anchor each angle in a concrete, valuable front-end offer or lead magnet (audit, playbook, calculator, teardown, benchmark, quick win, etc.)." / "Front-end value first: Ideally propose a lead magnet/front-end offer before selling core services to open the door." / "Value props & offers: Make them hyper-specific (metrics, timelines, constraints, integration realities)." / "Offer clarity: Front-end offers must be specific (format + outcome + time requirement)." (Enterprise prompt, L3712, L3730, L3737, L3830).
- "Do not invent a new offer in the follow-ups." (4. Write Step 2 and Step 3, L143).
- The 5 elements: "— A frontend offer too good to ignore / — A result claim specific enough to believe / — A guarantee that removes all the risk / — Social proof that makes it feel inevitable / — Volume high enough that math works in your favor" (L1111-1115).
- Offer test (L1369-1377): "1/ Is the outcome completely obvious? (If no → rewrite) / 2/ Is the risk clearly on you, not them? (If no → add guarantee) / 3/ Can they calculate ROl in 10 seconds? (If no → be more specific) / 4/ Is the promise quantifiable? (If no → add numbers) / 5/ Does replying feel easier than ignoring? (If no → remove friction) / If you answered "no" to ANY of these, your offer is garbage and that's why you're not booking meetings. Fix the offer. Then send".
- Definitions (L1384-1390): front-end offer = "a low-risk, high-value, and easy-to-understand proposition designed to initiate a relationship with a prospect, not to make an immediate, high-ticket sale". Back-end offer = "a high-value, often higher-priced product or service that is offered to a prospect after they have already engaged with or purchased a low-friction initial offering". Cold traffic friendly offer = "a value-driven, low-friction proposition designed to initiate a conversation with someone who has zero prior awareness of your brand."
- "Me: That's not an offer. That's a company bio." ... "Your service is what you do. Your offer is why someone picks you over the 50 other companies in their inbox saying the same thing. / You were selling the service, but never actually gave them the offer." (MCA conversation, L1464, L1503-1506).
- "When the product is weak, lean into the lowest-friction entry point. / Free and specific will always outperform vague and paid." (L3084-3087).
- "TL,DR for not selling a commoditized offer: / Find the one thing that is actually different about your product or service and anchor your entire cold email copy to that." (L3264-3267).
- Free offers without sounding desperate: "And yes, this is completely free because we already know it works for companies like yours." / "And yes, this is free because we've already done it for 26 companies in your exact space." / "This works because most free offers subtly imply desperation of "please just give us a shot."" (L1099-1108). The "26 companies" figure is an example, not a fact.
- Lead magnet theory: "A good lead magnet solves a narrow problem for the lead, then introduces a new problem solved by the offer." (L2301). "Leverage a part of your service that already works to generate a lead magnet. A lead magnet provides a complete solution to a very narrow problem." (L3465). Levels 1-3 by perceived value (L2302 / L3276-3298).
- Risk reversal / pay-on-performance: "We're only paid when you are." (Campaign 1, L897). **Only with the client's approved guarantee** (non-negotiable 3). The "Offer Introduction" guarantee list (L3358-3462) is labelled BAD/too hype by the SOP's own archive rule.
- Incentives (call-taker gifts): "$25 amazon gift card just for taking the initial call / reply rates doubled" (L3141-3144). AirPods ROI math (L3168-3186). These are client offer decisions (Forge/Atlas + Alex), never something Scribe adds.

### 1.11 Personalisation

- "Always personalize with recipient's first name if available." (L2156).
- "0 personalization + 10/10 offer beats 10/10 personalization + 6/10 offer." (L1134).
- "Does this feel written for this market?" (Checklist, L208). "Does this feel like it was written for THIS person specifically?" (Guide checklist, L1000). "Did you actually research my company?" (5 things, L1126).
- Signal: "You can also add a signal on top of either structure, or leave it unspoken and baked into the offer itself. Example signal: 'I saw you posted 10 blogs last month — how are you turning those into Reddit-native content?'" (L872).
- "Why you why now (I noticed something about your company that made me reach out)" (L1140).
- The model examples' pattern: "they spot something specific, ask or state something that only an insider would know, then make the ask feel like the obvious next step." (L1444).
- "This can be done by making the list the message or it can be done by using AI." (Transcript, L1646).
- Personalisation ideas list (L2303-2316 / L3495-3508): website visitors, employee 1 or 2, competitors, ads/icebreaker, website/LinkedIn data, case study/customers, suggest leads, potential clients, recently left jobs, funding, restaurants, SEO check, product call-out.
- Enterprise prompt section 5: "Provide a bullet list of personalization ideas with an example for every idea. If you can't give an example, don't include the idea." (L3787). Examples are at L3789-3796.
- Automated lines must look personal: "Automated line that looks personal + ties to relevance." / "Tie PS back into email copy to look more human." (annotated promotion example, L1353-1357).
- RULES adds fallbacks for every variable (see 1.7).

### 1.12 Follow-ups (Steps 2, 3, 4)

- "### Step 2 job / Clarify the first email and make it easier to believe." (4. Write Step 2 and Step 3, L135-136).
- "### Step 3 job / Add trust, proof, examples, or practical ideas." (L139-140).
- "Do not invent a new offer in the follow-ups." (L143).
- Time target: "20 min — Steps 2–3" (L696).
- "The 'I know this sounds crazy' move", Campaign 1 follow-up (L901-912): "Opening: "I realize this is probably crazy — you probably didn't even believe me. Let me explain better." / What it added: 1. A detailed breakdown of exactly how it works 2. Three specific itinerary ideas the community could experience 3. A full case study breakdown for the featured proof story / Why the itinerary mattered: A scammer would never go to this level of effort. It signals legitimacy without saying it. / Result: Of all interested replies, ~50%+ graduated to calls. The trust gap was the bottleneck — and the follow-up closed it."
- Ultimate Cold Email Sequence (L2299, fuller at L3480-3494): "Email 1 = relevant first line + case study + CTA; Email 2 = new first-line variation + more proof + softer CTA; Email 3 = right-person check." Step 2: "{Another variation of Email 1's first AI-generated line} / {Another form of social proof} / {Softer CTA (not direct to call - but ask if they would like to explore this further)}". Step 3: "Since you are the {TITLE} at {COMPANY}, thought you would be the right person to reach out to regarding {your offer}. / Would you be the right person for this?"
- "Answer recurring objections earlier ... That's a simple pre-objection handle. You're clearing up what you do before another person has to ask." (L1677-1681).
- "If you contact someone multiple times then you show that you are serious. Curiosity increases because they fear they're missing out." (L3468).
- "Never say "I am following up" or terms similar." (L2172).
- Follow-up templates in the library: Quick 1/2 Step, Added Context (Objection), Leaving Company Stoked, Meme Resonation, Closers.io 1A-3, HubSpot Follow-up 2/2B/3 (verbatim in 4.10).
- Ikeuchi: "Later in the sequence, we asked to reach whoever was dealing with "the daily headache of fisheyes and contamination rework."" (L1717). A later step can be a right-person ask in the buyer's own words.
- **Step 4: not covered anywhere in the SOP. UNKNOWN.** The 2-hour SOP has Steps 1-3 only. The Ultimate sequence has 3 emails. RULES sets 2 days between emails by default, and Generate Filters assumes 3 steps ("daily limits x 14 days / 3 steps"). Ask Alex before writing a Step 4.

### 1.13 Signature and P.S.

Verbatim block (2-hour SOP, after "### SPINTAX IT", L170-179):

```text
--
{Best regards|Kind regards|Warm regards|Sincerely|Thank you|Thanks|Yours truly|With best wishes|Best wishes|Warm wishes},
{SENDER_FULL_NAME}
{ROLE}, {CLIENT COMPANY}
{WEBSITE}(.)io
123.456.7890
6 Sheila Ct, Matawan, NJ 07747
{P.S|P.s.|p.s.} or tell me to pound sand if you'd like..
```

- "123.456.7890" is a placeholder phone number. The street address belongs to an UNKNOWN owner. Take the real sender name, role, company, website and address from the client record. Never reuse this address for another client.
- "{WEBSITE}(.)io" writes the website without a clickable link (see 1.14).
- The P.S. opt-out invites "stop" replies. RULES 2026-11-23: "Unsubscribe link stays OFF on every campaign ... Opt-outs come by reply (the P.S. invites it) and are always honoured."
- P.S. Line Bank (library L2291-2295): Relevant/Personalized, Case Studies, RR/Guarantee, Opt-out ("Or feel free to tell me to pound sand..."). Verbatim in 4.10.
- P.S. patterns: "P.S. We use data like this to get outcomes like [X] for [Brand Name]." (L828). "PS: a quick reply of leave me alone, not cool, whatever and I promise not to send another email for life:)", annotated "VERY human-looking PS" (L1329-1330). "PS - And congrats on the promotion! / Tie PS back into email copy to look more human." (L1356-1357). "Base 2: Hi FNAME - if we could {OFFER}, would you be interested? Signature. P.S. with Case study." (L2298).
- **RULES conflict:** "no manual signature" (RULES 2026-11-17) vs this signature block (section 7, C7).

### 1.14 Links and tracking

- "No links." (Triple Tap, L1013).
- "Not asking for a demo or sending a calendar link." (L3123).
- Website in the signature as "{WEBSITE}(.)io" (L174), i.e. not a live link.
- The library still has link templates: "Free Doc Link ... Have fun - Link" (L2442-2444). That breaks "No links", so it is labelled BAD.
- **Open/click tracking: not mentioned anywhere in the SOP. UNKNOWN.** RULES: unsubscribe link is always off. Booking replies use two dated times, no calendar link.

### 1.15 Anything else (process rules that touch copy)

- "Do not move on until this is written." The 4 lines are ICP / Pain / Dream outcome / Proof (L20-36).
- Campaign Thesis title format: "Title: ([CLIENT] ICP - FILTERS - SOURCE (ANGLE))" (L56).
- "Then choose one winner. / Do not keep rewriting forever." (L95-98).
- "If it passes, stop editing." (Checklist, L211).
- "If it fails that test, rewrite once. / Once." (8. Final send check, L478-481).
- "Do not keep rewording a script that already works." (Hard rules > Rule 4, L520).
- "What should take the most time / Only these 3 things: - choosing the right pain - choosing the right proof - choosing the right contacts / Everything else should move fast." (L679-686).
- Inputs before writing Step 1 (L101-109): "Open Claude, input: 1. Onboarding Form 2. Previous Campaign Results 3. Client Offer Sheet 4. Client Case Studies (if available) 5. This Cold Email SOP + Client Master Document".
- Source priority (enterprise prompt, L3707-3710): "Primary: Direct client feedback & onboarding data / Secondary: Call transcripts & stated objectives / Supporting: Market research & competitive analysis".
- "Pain points: Only mention pains that are persona-true and likely active; avoid generic boilerplate." (L3734).
- "Each variation must feel meaningfully different (not light rewrites)." (L3827). This matches RULES "Never trivial word swaps".
- Ikeuchi method: "Save the complaint with its context so you don't put a paint-shop concern into an email about circuit boards." (L1729). "Before your next sequence goes out, give it to the person who took those calls. Ask whether it describes the problem the buyer brought up and answers their concern." (L1735). "If you're not being specific, no one's going to care." (L1705).
- "Changing the copy doesn't fix a sending problem, so keep checking delivery health before you launch another round." (L1687).
- "Respect opt-outs and keep bounced or suppressed contacts out of it." (L1686).
- Client offer sheet ranges, from Alex's own note to Lead FLO (L5376-5412, client-specific): "I'm not going to promise these numbers. / I simply want realistic expectations for each vertical so our messaging feels concrete." ... "These numbers are for positioning only." Ranges a client gives are positioning aids, not promises.

---

## 2. Frameworks and structures

### 2.1 The two jobs of every email: Curiosity + Trust
- **When:** always. "The Non-Negotiable Formula 1. BUILD CURIOSITY — make them want what you're offering 2. EARN TRUST — make them believe you can deliver it / Without BOTH, they will not reply." (L731-736).
- "Curiosity = the Dream Outcome (what you'll do for them) / Trust = the Perceived Likelihood of Achievement (why they should believe you)" (L740-741).

### 2.2 The 4-line campaign definition (ICP / Pain / Dream / Proof)
- **When:** before any copy ("Do not move on until this is written.").
- **Steps:** ICP: who exactly. Pain: one problem only. Dream outcome: money, time, or status. Proof: one client, one source, or one specific insight.
- **Alex's example (L29-33):** "ICP: high-ticket home and garden Shopify brands / Pain: buyers hesitate before committing online / Dream outcome: more sales from existing traffic / Proof: work with brands like Planta / Fire Pit Outfitter". The Planta / Fire Pit Outfitter proof belongs to one client (owner UNKNOWN). Never reuse it for another client.

### 2.3 Dream outcome: Money / Time / Status
- **When:** choosing the promise. Pick the one that fits this audience.
- Examples (L749-754): "Money: More revenue, more profit, better ROI. e.g. 'We helped a solo founder like you generate $80K in 90 days.' / Time: Get back hours, automate a process, remove friction. e.g. 'What if your team never had to chase warm leads again?' / Status: Recognition, credibility, speaking engagements, acquisition appeal. e.g. 'What if people just knew who you are — and you got invited to speak at events?'"
- "Status is extremely underrated." (L757).
- **How to present (L761-764):** "Describing who it's for first — 'for people running ads like you,' 'for solo founders like yourselves' / Anchoring the outcome to their specific situation / Positioning around what's most believable given where they are".
- Same offer, two audiences (L768-773): A, founder not posting: "What if your team did content so your business was more acquirable — and you could eventually exit?" B, founder already posting: "We can enhance what you're already doing to turn your existing content into more pipeline — which is probably more believable than starting from scratch."

### 2.4 Structure 1: Question → Proof → CTA ("poke the bear")
- **When:** "Use when the prospect may not fully realize the problem." (L69). "You're not sure how aware your prospect is of the problem you solve. The question 'pokes the bear' — it wakes them up to a problem they may not have been thinking about." (L837).
- **Steps:** 1) a question that makes them see one specific gap. 2) proof/mechanism ("We do that for [same-world proof] by [simple mechanism]."). 3) one CTA.
- **Alex's template (Fast reusable templates, L656-663):** "What are you doing to solve [pain] so [dream outcome] happens? / We do that for [same-world proof] by [simple mechanism]. / Want me to send over [resource]?"
- Examples: "What are you doing to make sure your three fresh sales hires have engaged leads to work every day?" (L841). Blog → Reddit question + "Offer + Proof" (L851-857). "How do you know you're not sitting on multiplayer gold mines in your single-player catalog?" (L939).
- Transcript: "why I think it's actually the best way to start writing cold email is they get you to think about the way someone might think about a problem and they help you lay out single solution emails" (L1646).

### 2.5 Structure 2: Offer → (Proof) → CTA
- **When:** "Use when the outcome is already easy to want." (L73). "You're confident enough in your offer to lead with it directly. Often the proof is baked directly into the offer itself" (L861).
- **Alex's template (L666-673):** "If I could help [company] get [dream outcome], that usually leads to [benefit]. / That's the same problem we've worked on for [proof]. / Would you be open to [small ask]?"
- Example: "If I could turn all 10 of your blogs per month into Reddit-native content that ranks in Google's product-led searches — 40% of which now pull from Reddit — would you be interested in seeing the audit I already did for your business?" CTA variants: "Would you be interested in a 2-minute Loom? / ... a short discussion about your Reddit strategy? / ... seeing the breakdown?" (L865-871).
- "Ex: "{{first_name}} - if we ran a free outbound campaign for {{company}} to book 10 calls this month like we did for XYZ - would you be interested?"" (L1250).
- Base 2 (L2298): "Hi FNAME - if we could {OFFER}, would you be interested? Signature. P.S. with Case study."
- Rule: pick one structure; "Do not blend them unless you have a very good reason." (L76).

### 2.6 Triple Tap Framework (L1010-1013)
- **When:** every email. It is the named framework in Dulcy's copy prompt, but never mention it in copy.
- "1. **First Tap (Open)**: Write a subject line that sparks curiosity, sounds like a vendor or client email, and never feels salesy. 2. **Second Tap (Read)**: Write the body (max 3–4 sentences). Identify a problem, show credibility (clients/results), and offer a simple solution. Use a 6th-grade reading level. 3. **Third Tap (Reply)**: End with a low-friction CTA answerable in one word. No links. No "book a call." No friction."

### 2.7 Knowledge as Proof: "The Stealth Offer"
- **When:** you can do a piece of real work for them up front (scraped list, audit, keyword pull), or you have no case study yet.
- Example (L819-829): "Subject: Stole your competitor's customer list (kind of) / "What if you could steal customers from your competitors?" / "I wrapped up the followers of [Brand Name] into a CSV and found that around 20% are likely ICP fits as [ICP Name]. Want to check it out?" / P.S. We use data like this to get outcomes like [X] for [Brand Name]. / What's happening here: The true offer is hidden behind a valuable intro offer. The knowledge (custom research, scraped data) proves skill — which makes the larger offer believable."
- "That's not a pitch, that's a demonstration of capability. ... It flips the dynamic from "trust me" to "look what I already know about your situation."" (L1176).

### 2.8 Third-party authority play
- **When:** no own proof yet, or the category is new to the market. Example: "Google says 25% of their references for product-led search come from LinkedIn." (L806). Campaign 2 used ""600 million eyeballs are on [platform]"" and ""Reddit is the #2 source for search — 97% of [stat]"" (L921-922). These stats are examples only. Any stat used must be real and sourced.

### 2.9 Reframe with a new label ("secondhand leads")
- **When:** the market lives with a problem they have stopped noticing.
- "Best copy trick I know: reframe their current state with a label they've never heard before. / Example - lenders who depend on bigger lenders for referrals. / I called them "secondhand leads." / Now they see it differently. Picked-over prospects. 20% premiums paid to the middleman. Scraps. ... Find your version of secondhand leads. / Draw a line in the sand. You are the new way, compare to their current way, make it the old way." (L1185-1209).

### 2.10 "Why you, why now" 4-line flow (L1140-1143)
- "Why you why now (I noticed something about your company that made me reach out) / Pitch the offer or ask a pain question or something to transition from what we / Not sure if its a fit but were helping companies like you do blah blah / Share an outcome based case study (the reason why i think its important that I reach out is we just helped someone create a xyz roi."

### 2.11 Model-example pattern (L1403-1444)
- Signal → insider question or claim → common failure / mechanism → why it fits them → tiny or zero-risk ask. "The pattern across all 3 is: they spot something specific, ask or state something that only an insider would know, then make the ask feel like the obvious next step." Full examples in 4.6.

### 2.12 Base 1 / Base 2 / Ultimate sequence (Library 00 Frameworks, Script Templates)
- "Base 1: Hi Name, I noticed you on X and I'm reaching out because of Y. We USP that solves Z in Timeframe without No good rotten thing. Offer something for free." / "Base 2: Hi FNAME - if we could {OFFER}, would you be interested? Signature. P.S. with Case study." / "Ultimate Cold Email Sequence: Email 1 = relevant first line + case study + CTA; Email 2 = new first-line variation + more proof + softer CTA; Email 3 = right-person check." (L2297-2299; fuller at L3471-3494).

### 2.13 Enterprise length × complexity matrix (prompt at L3692-3852)
- **When:** enterprise/persona campaigns, or several personas.
- Lengths ~30 / ~45 / ~60 words × tiers "Simple / Niche-aware / Hyper-specific". 1 persona → 6 variations, 2-3 personas → 3 each, 5+ → 1 each. At least 3 structural elements per script. **RULES WINS on the number shipped:** 2 angles of Email 1 per campaign. Use the matrix to draft, then pick 2.

### 2.14 Segment by buying situation
- **When:** the offer means different things to different buyers. "Audiences really segment themselves based on your offer. ... For a company with reps, you could test helping them find better accounts to approach. For a founder without a sales team, you could test finding demand before they hire." (L1668-1670). "Write each of them their own insider message." (L1676).
- Ikeuchi (another agency's client, never reuse the facts): same product (humidification), PCB copy about "scrap rate" / "rework station backlog" / "non-wetting humidification". Paint-shop copy about "dust contaminations and fisheyes". (L1700-1717).

### 2.15 Local / geographic frame and monthly rinse-and-repeat (L1283-1310)
- Local proximity opener, plus a monthly cycle: "Pull new list / Change angle / Refresh copy / Run again" with example angles "Month 1: "Local operator reaching out.." Month 2: "Helping Dallas businesses with X..." Month 3: "Saw you guys expanding in Dallas..." It compounds."

### 2.16 Front-end lead magnet → back-end offer
- "A good lead magnet solves a problem for lead who then introduces a new problem which is solved by your offer. / Make an offer so good, that people feel stupid for saying now" (L3274-3275). Levels (L3276-3298): Level 1 White paper, Webinar, Mini Course, E-Book, Templates, Survey. Level 2 Samples, Free Trials, Free Tools, Free Evaluation. Level 3 Leads, Calls Booked, Ad creatives, Listing Optimization, Service Sample, Free Course, Free Software, "Landing page for free, if it converts 5% then you pay me".

---

## 3. Checklists and QA tests

### 3.1 2-hour SOP checklist (5. Run the checklist in 10 minutes, L185-211), verbatim

```text
### Dream outcome
* - Is it money, time, or status?
* - Is it written in plain language?
* - Does it clearly fit this audience?
### Trust
* - Are there at least 2 proof elements?
* - Does the proof reinforce the exact dream outcome?
* - Is the source / brand actually meaningful to the reader?
### Structure
* - Am I clearly using Question → Proof → CTA or Offer → Proof → CTA?
* - Is there exactly one CTA?
* - Is the email 30–75 words?
### Final check
* - Could a scammer have sent this?
* - Does this feel written for this market?
If it passes, stop editing.
```

### 3.2 Guide "Pre-Send Checklist" (L976-1001), verbatim

```text
Pre-Send Checklist
	DREAM OUTCOME
	  [ ]  Is it money, time, or status — and is that right for this audience?
	  [ ]  Is it written in plain language (not stats/jargon)?
	  [ ]  Does it say who it's specifically for?
	TRUST
	  [ ]  Have I included at least 2 proof elements?
	  [ ]  Does the proof reinforce this specific dream outcome?
	  [ ]  Is the authority figure/source someone this recipient would know and trust?
	STRUCTURE
	  [ ]  Am I using Question > Proof > CTA  OR  Offer > Proof > CTA?
	  [ ]  Is there exactly ONE clear CTA?
	  [ ]  Is the email between 30–75 words?
	FINAL CHECK
	  [ ]  Could a scammer have sent this? (If yes, add specificity)
	  [ ]  Does this feel like it was written for THIS person specifically?
```

### 3.3 Final send check (8. Final send check in 10 minutes, L465-481), verbatim

```text
Read the email like the prospect.
Ask:
* - Why would I care?
* - Why would I believe this?
* - Why is replying worth it?
* - Is the ask small enough?
If it fails that test, rewrite once.
Once.
```

### 3.4 The prospect's 5 questions (L1121-1131), verbatim

```text
Your prospect only cares about 5 things when they open your email:
1. Will you make me more money?
2. Have you done this for people like me?
3. Did you actually research my company?
4. Are you a real person or a scammer?
5. Is this a waste of my time?
Address all 5 in under 50 words or get fucked.
```

### 3.5 Two tests for copy (L1087)
"19. Two tests for copy: Can a 10-year-old understand what you're selling? Would you actually say this to someone in person?"

### 3.6 Offer test, 5 questions (L1369-1377), verbatim

```text
1/ Is the outcome completely obvious? (If no → rewrite)
2/ Is the risk clearly on you, not them? (If no → add guarantee)
3/ Can they calculate ROl in 10 seconds? (If no → be more specific)
4/ Is the promise quantifiable? (If no → add numbers)
5/ Does replying feel easier than ignoring? (If no → remove friction)
If you answered "no" to ANY of these, your offer is garbage and that's why you're not booking meetings.
Fix the offer. Then send
```

### 3.7 Read aloud + rep check (Ikeuchi newsletter, L1732-1735)
"4. Read it out loud, then check it with your reps / Then read the email out loud. / It needs to sound like you're talking to someone at a bar. ... Before your next sequence goes out, give it to the person who took those calls. Ask whether it describes the problem the buyer brought up and answers their concern."

### 3.8 Enterprise prompt guardrails (L3823-3831), verbatim

```text
8) Quality Standards & Guardrails
25–69 words per script (strict).
All {{variables}} must be valid, consistently named, and Clay-merge-safe.
Use plain language; avoid jargon unless in Hyper-specific tier where it improves trust.
Each variation must feel meaningfully different (not light rewrites).
No emojis. No punctuation in subject lines.
Proof rigor: Social proof must be adjacent (same role/region/size/stack). Pains must be current and role-true.
Offer clarity: Front-end offers must be specific (format + outcome + time requirement).
Brevity/clarity rule: If a short line feels stilted or vague, do not ship it—choose the 45- or 60-word band for natural flow.
```

### 3.9 Spintax QA (from the spintax prompt, L3522-3523)
- Every option combines with every other (1,3,2 and 1,2,1 must read right). All variations grammatical. No spintax on words containing `{}` (variables). Conversational. Max 4 spintax sets per sentence.

### 3.10 Archive test (99 Archive Recommendations, L3511-3515)
- Reject or rewrite anything Too Generic / Too Hype / Duplicate Concept / Botty (quoted in 1.8).

### 3.11 List usability benchmarks (Scout, but they affect copy volume) (L335-345)
- "90%+ = very clean / 85%+ = strong / below 75% = probably too noisy". Practical: "40–50% usable / 30–40% borderline / 10–20% unusable". RULES 2026-11-17/23 sets 80% (prefer 85%+) as a warning, never a lock.

---

## 4. Every example email or snippet (verbatim, labelled)

**Labels:** **GOOD** = follows the SOP's own rules and is a model. **MIXED** = good idea that breaks a rule (length, CTA, link, proof). **BAD** = the SOP itself calls it weak (99 Archive) or it breaks a hard rule. **Owner** = whose facts these are. **Never reuse any named company, number, city, person or result** from this section as a fact for a Dulcy client. They are other agencies' or placeholder facts. Only the shape is reusable.

### 4.1 2-hour SOP core

- Campaign definition example (L29-33). GOOD. Owner: UNKNOWN client (ecommerce home & garden). **Client-specific proof:** "Planta / Fire Pit Outfitter".

```text
### Example
- ICP: high-ticket home and garden Shopify brands
- Pain: buyers hesitate before committing online
- Dream outcome: more sales from existing traffic
- Proof: work with brands like Planta / Fire Pit Outfitter
```

- Fast reusable templates (L653-673). GOOD. Generic placeholders.

```text
## Question → Proof → CTA
What are you doing to solve [pain] so [dream outcome] happens?
We do that for [same-world proof] by [simple mechanism].
Want me to send over [resource]?
## Offer → Proof → CTA
If I could help [company] get [dream outcome], that usually leads to [benefit].
That’s the same problem we’ve worked on for [proof].
Would you be open to [small ask]?
```

### 4.2 Guide snippets (L715-1005). Owner of the campaigns: UNKNOWN (creator video/guide, not verified Dulcy results)

- Dream outcome examples (L749-754, L757). GOOD.

```text
	Money
	More revenue, more profit, better ROI. e.g. 'We helped a solo founder like you generate $80K in 90 days.'
	Time
	Get back hours, automate a process, remove friction. e.g. 'What if your team never had to chase warm leads again?'
	Status
	Recognition, credibility, speaking engagements, acquisition appeal. e.g. 'What if people just knew who you are — and you got invited to speak at events?'
Status is extremely underrated. One example: a content agency owner switched his entire offer to status — 'Forget getting calls. What if people just knew you existed and wanted to meet you?' — and it crushed.
```

- Same offer, different audiences (L767-773). GOOD. Content-agency offer.

```text
Example: Same Offer, Different Audiences
	Audience A — Founder who doesn't post content:
	"What if your team did content so your business was more acquirable — and you could eventually exit?"
	Audience B — Founder already posting content:
	"We can enhance what you're already doing to turn your existing content into more pipeline — which is probably more believable than starting from scratch."
```

- Third-party authority, LinkedIn + AI search (L805-809). GOOD. The stat is an example, verify before use.

```text
Example: LinkedIn + AI Search
	"Google says 25% of their references for product-led search come from LinkedIn."
	Use this when you don't yet have your own social proof. It makes the VALUE of what you do undeniable — before you've even proven you can deliver it.
```

- Stealth offer, knowledge as proof (L817-829). GOOD.

```text
Knowledge as Proof: The Stealth Offer
Example: Stealing Competitors' Customers
	Subject: Stole your competitor's customer list (kind of)
	"What if you could steal customers from your competitors?"
	"I wrapped up the followers of [Brand Name] into a CSV and found that around 20% are likely ICP fits as [ICP Name]. Want to check it out?"
	P.S. We use data like this to get outcomes like [X] for [Brand Name].
	What's happening here: The true offer is hidden behind a valuable intro offer. The knowledge (custom research, scraped data) proves skill — which makes the larger offer believable. You've combined Knowledge as Proof with Social Proof in a single email.
```

- Poke the bear, sales hires (L840-847). GOOD.

```text
Poke the Bear — What It Looks Like
	"What are you doing to make sure your three fresh sales hires have engaged leads to work every day?"
	What this does: Forces the prospect to think about a specific gap in their process — and immediately primes them for your solution (lead scoring, lead routing, whatever it is).
	Why it works: You can only sell a single solution in a cold email. The question helps you frame ONE problem and attach ONE specific offer to it.
```

- Blog content → Reddit, Structure 1 (L850-857). GOOD. Content/AI-search agency.

```text
Example: Blog Content → Reddit
	Question: "Are you making sure the great content you have in blogs also becomes Reddit posts that ChatGPT delivers to your priority customers as answers?"
	Offer + Proof: "We take all that content for companies like [Blank] and use agents with humans in the loop to turn blog content into Reddit-native content — so your best content gets distributed everywhere."
	CTA: [Permission-based or resource-based — see below]
```

- Blog-to-Reddit offer lead, Structure 2 (L864-872). GOOD.

```text
Example: Blog-to-Reddit Offer Lead
	"If I could turn all 10 of your blogs per month into Reddit-native content that ranks in Google's product-led searches — 40% of which now pull from Reddit — would you be interested in seeing the audit I already did for your business?"
	Variants of the CTA:
	- Would you be interested in a 2-minute Loom?
	- Would you be interested in a short discussion about your Reddit strategy?
	- Would you be interested in seeing the breakdown?
	You can also add a signal on top of either structure, or leave it unspoken and baked into the offer itself. Example signal: 'I saw you posted 10 blogs last month — how are you turning those into Reddit-native content?'
```

- Campaign 1: Community Brand (travel/community trips) (L889-912). GOOD (initial + follow-up). **Results are that campaign's, not Dulcy's:** 52 replies, 26-30 calls, 2,400 contacts.

```text
Campaign 1: Community Brand — 52 Replies, 26-30 Calls in 2,400 Contacts
Initial Email
	Dream Outcome: 'We're partnering with community owners to run a trip with their community that pays $10K-$30K.'
	Social Proof: Referenced a recognizable community owner who had done it.
	How It Works (friction reducer): 'All we do is send three emails to your community to see if there's interest. We're only paid when you are.'
	Risk Reversal: Pay-on-performance model baked into the offer.
	Follow-Up Email (The 'I know this sounds crazy' move)
	Opening: "I realize this is probably crazy — you probably didn't even believe me. Let me explain better."
	What it added:
	1. A detailed breakdown of exactly how it works
	2. Three specific itinerary ideas the community could experience
	3. A full case study breakdown for the featured proof story
	Why the itinerary mattered: A scammer would never go to this level of effort. It signals legitimacy without saying it.
	Result: Of all interested replies, ~50%+ graduated to calls. The trust gap was the bottleneck — and the follow-up closed it.
```

- Campaign 2: Founder Story, third-party authority (AI search / Reddit content) (L915-931). GOOD.

```text
Campaign 2: Founder Story — Third-Party Authority Play
Email Structure
	What made it work: The founder had built a strong content presence, so his name alone carried credibility.
	Third-Party Authority used:
	- "600 million eyeballs are on [platform]" — cited from a well-known, trusted source
	- "Reddit is the #2 source for search — 97% of [stat]"
	Why: The offer (AI search / Reddit content) was so new that the market didn't understand the value yet. Third-party proof was used to ESTABLISH the value before pitching the service.
	CTA: Audit or resource — low-friction, easy to say yes to.
	Lesson: When your offer is ahead of the market's awareness, use third-party authority to validate the CATEGORY before pitching your solution.
```

- Campaign 3: Video Game IP (game publishers) (L934-952). GOOD, ultra short.

```text
Campaign 3: Video Game IP — Poke the Bear + Knowledge Proof
Email (Ultra Short, One of the Most Successful Campaigns)
	Subject: [Cultural reference baked into subject line]
	"How do you know you're not sitting on multiplayer gold mines in your single-player catalog?"
	[Called out 2-3 specific underutilized game titles by name]
	"We're helping publishers spot these gold mines inside their portfolio. Would it be unreasonable to think we'd spot even just one incredible earning opportunity for you — on the house?"
	Third-Party Proof: Named a specific, well-known game company they'd worked with.
	Paid offer behind the scenes: Pitching underutilized IP to external partners / monetization channels.
	Why it worked: The question created immediate self-doubt (What ARE my underutilized IPs?). The knowledge proof (specific game callouts) signaled real expertise. The 'on the house' offer lowered the barrier to zero.
```

### 4.3 "First Lines" / "Second Lines" swipe (L1022-1080)

- First lines 1-11 repeat the guide (GOOD). The two long emails are **MIXED**. Montucky (creative agency → beverage brand; other agency's proof "Liquid Death, Harper Wilde") is ~95 words with a hard call CTA "do you have 15 minutes this/next week". Dance studio (Meta ads → fitness/dance studios; proof "ILoveKickBoxing and Wellness Wyckoff", "20-25 new members per month") is ~85 words, call CTA. Both have great personalisation and humour. The last second-line (L1079) is a fragment: proof "Coca Cola" belongs to another agency.

```text
First Lines:
"What if your team did content so your business was more acquirable — and you could eventually exit?"
"We can enhance what you're already doing to turn your existing content into more pipeline — which is probably more believable than starting from scratch."
Forget getting calls. What if people just knew you existed and wanted to meet you?
"What if you could steal customers from your competitors?"
"What are you doing to make sure your three fresh sales hires have engaged leads to work every day?"
"Are you making sure the great content you have in blogs also becomes Reddit posts that ChatGPT delivers to your priority customers as answers?"
"If I could turn all 10 of your blogs per month into Reddit-native content that ranks in Google's product-led searches — 40% of which now pull from Reddit — would you be interested in seeing the audit I already did for your business?"
'We're partnering with community owners to run a trip with their community that pays $10K-$30K.'
 "I realize this is probably crazy — you probably didn't even believe me. Let me explain better."
"How do you know you're not sitting on multiplayer gold mines in your single-player catalog?"
Hey Annie! happy Friday yada yada (: So I got a targeted ad for Montucky Cold Snacks and am honestly so happy about it. Your stuff looks incredible - seriously love your creative direction. Might have to go buy your {{tucky pit vipers}} now though... Anyways, reaching out because we've finished up some creative work for similarly cool brands (Liquid Death, Harper Wilde) and have some time in the next couple months to dig into something new. Would love to hear about what you have coming up so we can huddle and come up with some ideas...do you have 15 minutes this/next week
Hi Mike! I was looking for {{dance studios}} in the {{Santa Ana area}} and came across a glowing review by {{Dennis Tran...people seem to really love the strong ensemble of instructors!}} Have you ever tried building a meta ads campaign featuring success stories of your top members? We're helping others like ILoveKickBoxing and Wellness Wyckoff implement this strategy and it's driving 20-25 new members per month for them. It's honestly not that complicated, could show you how in like 30 minutes (no strings, I'm just in a giving mood) -- any time this/next week?
Second Lines:
"I wrapped up the followers of [Brand Name] into a CSV and found that around 20% are likely ICP fits as [ICP Name]. Want to check it out?"
Offer + Proof: "We take all that content for companies like [Blank] and use agents with humans in the loop to turn blog content into Reddit-native content — so your best content gets distributed everywhere."
How It Works (friction reducer): 'All we do is send three emails to your community to see if there's interest. We're only paid when you are.'
"We're helping publishers spot these gold mines inside their portfolio. Would it be unreasonable to think we'd spot even just one incredible earning opportunity for you — on the house?"
Anyways, reaching out because we've finished up some creative work for similarly cool brands (Liquid Death, Harper Wilde) and have some time in the next couple months to dig into something new.
Kinney), NY (Williamsburg) and Chicago (Magnificent Mile). Not sure what your budget looks like right now but they are saying they can do these at half-rate (actually, similar spots we ran for Coca Cola).
```

### 4.4 Client Master Document snippets (L1081-1209)

```text
CTA:
**CLIENT MASTER DOCUMENT**
KEEP IT SIMPLE AND CONVERSATIONAL
—
19. Two tests for copy: Can a 10-year-old understand what you're selling? Would you actually say this to someone in person?
—
98% of the effectiveness of a cold email has NOTHING to do with what is written inside the email, but the actual concept of the thing you're selling.
A winning offer beats every "hack" & "trick" you’ve ever read about.
And yes, this is completely free because we already know it works for companies like yours."
Or for even more conviction:
"And yes, this is free because we've already done it for 26 companies in your exact space."
This works because most free offers subtly imply desperation of "please just give us a shot."
— A frontend offer too good to ignore
— A result claim specific enough to believe
— A guarantee that removes all the risk
— Social proof that makes it feel inevitable
— Volume high enough that math works in your favor\
—
Your prospect only cares about 5 things when they open your email:
1. Will you make me more money?
2. Have you done this for people like me?
3. Did you actually research my company?
4. Are you a real person or a scammer?
5. Is this a waste of my time?
Address all 5 in under 50 words or get fucked.
0 personalization + 10/10 offer beats 10/10 personalization + 6/10 offer.
```

```text
Why you why now (I noticed something about your company that made me reach out)
Pitch the offer or ask a pain question or something to transition from what we
Not sure if its a fit but were helping companies like you do blah blah
Share an outcome based case study (the reason why i think its important that I reach out is we just helped someone create a xyz roi.
—
your offer is fine, your evidence isn't
everyone can pitch a dream outcome but almost no one makes a skeptical buyer think "ok that could actually work for us"
Here's the 3 types of proof you can include in your emails (aim to have 2 or more weaved in naturally).
1. Social proof — I did the thing for someone like you.
The more similar the proof is to the recipient, the more it converts. "We helped a SaaS company" is weak. "We helped a 15-person B2B SaaS selling to mid-market HR teams" is strong. Stack the specificity: same industry, same team size, same stage, same problem. The recipient should feel like you're describing their exact situation, not a vague case study.
2. Third party authority — A source they already trust validated the thing.
You're borrowing credibility from someone else. "Google says 25% of product-led search references come from LinkedIn" hits harder than you saying it because Google isn't trying to sell them anything. The key constraint: the authority has to match the recipient's worldview. Citing a niche cold email expert to a VP of Sales who's never heard of them does nothing. Cite sources they already respect.
3. Knowledge as proof — I already did the work, look at what I found.
This is the most underused one. "I pulled the followers of [competitor] into a CSV and found 20% are likely fits for your product. Want to check it out?"
That's not a pitch, that's a demonstration of capability. If this person can do this before they're even hired, they can probably do the bigger thing too. It flips the dynamic from "trust me" to "look what I already know about your situation."
the more specific your proof, the less selling you have to do
—
Best copy trick I know: reframe their current state with a label they've never heard before.
Example - lenders who depend on bigger lenders for referrals.
I called them "secondhand leads."
Now they see it differently. Picked-over prospects. 20% premiums paid to the middleman. Scraps.
Same situation they've been in for years. But now it's got a name.
When you reframe something they already know is true but never thought about this way, you become instantly believable.
They go: "Holy shit, that's exactly what we're doing."
Find your version of secondhand leads.
Draw a line in the sand. You are the new way, compare to their current way, make it the old way.
```

### 4.5 Swipe emails (L1217-1357)

- TBPN podcast sponsorship (L1217-1220). GOOD (short, named third-party proof, interest CTA). Owner: TBPN (media). Never reuse its partner names.

```text
{{name}} - we run TBPN, a podcast with {{listener number}} Director-level-and-up tech workers, partnered with Ramp, NYSE, Shopify, Phantom, and more.
Want {{company}}'s name alongside theirs on our show, live ticker, and social?
```

- Site search bar (L1226-1232). MIXED: clear problem → solution → one-word CTA, but no proof element.

```text
I find that a lot of b2b buyers are bouncing off of sites because they scan it and cant find the answers to their questions quickly.
We can add a search bar at the bottom of your page that is accessible and drives up conversions because it leads them right up to the answer they're looking for.
Is that something you'd be interested in?
```

- Reactivation (past conversations) (L1235-1244). GOOD shape for reactivation lists only (people Dulcy/client already spoke to). The call CTA is acceptable there.

```text
—reactivation
Hey {{name}}, we spoke in the past about {{what you do}}.
Wanted to touch base again because we {{did something new / have new method, etc.}}.
Would it make sense for us to chat later this week?
```

- Free outbound campaign, Offer→Proof→CTA (L1250). GOOD. "XYZ" is a placeholder.

```text
Ex: "{{first_name}} - if we ran a free outbound campaign for {{company}} to book 10 calls this month like we did for XYZ - would you be interested?"
```

- Kubernetes / CTO (L1253-1266). MIXED: role-pain-proof-CTA, one-word CTA ("Do you have this covered?"). But hard-coded real names (Intel, Ubisoft, Nokia, SNFC) where variables belong, "I assume", ~70 words. Owner: another vendor.

```text
Hello {FIRST_NAME}, as CTO of Intel, I assume Kubernetes reliability and scaling challenges is something that consumes your time.
You’re not alone - most companies in processor manufacturing bring up similar struggles.
We make Kubernetes boring in the best way by ensuring it stays reliable, safe, and consistent across every environment you manage.
We work with other enterprises like Ubisoft and Nokia to slash their attack surface by 95% and cut SNFC's incidents by 90%.
Do you have this covered?
```

- Creator for brand (L1270-1277). GOOD (short, specific, "Worth a chat?" as only CTA; but the Archive calls a stand-alone "Worth a chat?" generic).

```text
Hi [name], l've got a creator with [X,XXX,XXX] followers in the [type of brand] space — would love to see if he's a good fit to promote [brand name].
Worth a chat?
Cheers,
Nick
```

- Local Dallas (L1283-1310). GOOD local frame + rinse-and-repeat angles. Variable typos are in the original.

```text
Hey {(FirstName)).
Saw you're based in Dallas — I'm just nearby in Uptown.
We provide ({service)} for local (industry)) businesses and thought it might make sense to connect.
Would you rather grab coffee sometime or want me to stop by?
Monthly Rinse & Repeat Strategy
This is not a one-time campaign.
It's cyclical.
Every month:
* Pull new list
* Change angle
* Refresh copy
* Run again
Example angles:
Month 1:
| "Local operator reaching out.."
Month 2:
| "Helping Dallas businesses with X...:,
Month 3:
I "Saw you guys expanding in Dallas..."
It compounds.
```

- Med spa peptide intro (L1314-1317). GOOD (intro/matchmaking offer).

```text
Hi [name], I've got 4-6 med spas looking for verified peptide manufacturers to resell their products. Would love to see if an intro makes sense for [company name].
Worth a quick chat?
```

- Data waterfall, annotated (L1320-1330). GOOD (annotations are Alex's lesson notes: "Right to the point / Value props well-listed / Very soft CTA / VERY human-looking PS"). Owner: Nick's company (data vendor).

```text
—-
Nick, built [company].
Right to the point
Value props well-listed
Verified emails at scale via a seven-vendor waterfall: pulls signal data like funding and hiring surges, cleans messy records with Al, makes API calls into Clay or your tools. SaaS or API.
Worth passing to whoever owns your data?
Very soft CTA
[name]
Founder - [company]
VERY human-looking PS
PS: a quick reply of leave me alone, not cool, whatever and I promise not to send another email for life:)
```

- Promotion trigger, template + annotated example (L1335-1357). GOOD. "ABC Corp", "123 Company", "14 extra meetings" are placeholders.

```text
Subject line: {{function}}
{{first name}} - saw you recently got promoted at {{Company}}.
I'm sure as {{new title}}, {relevant offer}} has been on your mind for that reason.
Can I show you how we {{relevant social proof}}?
PS - And congrats on the promotion!
Ex.
Subject line: demand gen
This looks more like an internal email than a marketing-related subject line
Lucas - saw you recently got promoted at ABC
Corp.
Relevance.
I'm sure as Director of Demand Gen, getting more demos on your reps' calendars has been on your mind for that reason.
Can I show you how we helped 123 Company generate 14 extra meetings on a pay-per-lead model last month?
Automated line that looks
personal + ties to relevance.
Hyper-relevant social proof.
PS - And congrats on the promotion!
Tie PS back into email copy to look more human.
```

### 4.6 Model examples + breakdown (L1403-1444). GOOD. Industries: AI infrastructure, LinkedIn content agency, Canadian dev tax credit (the "million dollars" claim is that offer's, not general)

```text
Model Examples
1. "I saw you're looking to build agentic workflows. Have you guys figured out the infrastructure you're going to use to go from prototype to production? Most mid-markets taking their first steps into AI build something nice that works once but doesn't scale to production. We make that happen in minutes. Do you have any MVPs right now that I could demo for you for free?"
2. "Your team seems pretty active on LinkedIn. Thought content might be a focus. With you guys being well into Series A, I'd imagine there are golden nuggets hidden in all of your team calls and transcripts. What we do is set up a simple system so that you can anonymize everything before you feed us the data to turn it into founder LinkedIn posts. Think it would be really effective for you — you have 10,000 followers but just don't have the time to post every single day. Is this something worth discussing at all? I can send you a few example posts to get your feedback."
3. "Hey, looks like you're beefing up the dev team — I count seven. You might qualify for the Canadian dev tax break. If you really do have seven developers, you could be eligible for up to a million dollars over the next two years. Figure with you guys being Series A, runway is a priority. It doesn't cost anything to see if you qualify and we don't charge a penny unless you get it. Worth discussing?"
Models Broken Down:
Example 1 — Agentic AI:
* Signal: hiring post for agentic workflows
* Question that shows expertise: "Have you figured out the infrastructure to go from prototype to production?"
* Common failure: "Most build something that works once but doesn't scale"
* Mechanism: "We make that happen in minutes"
* Tiny ask: "Do you have an MVP I could demo for free?"
Example 2 — LinkedIn content:
* Signal: team active on LinkedIn
* Golden nugget insight: "I'd imagine there are golden nuggets in your team calls"
* Mechanism: "Simple system to anonymize and turn into posts"
* Why it fits them specifically: "10K followers but no time to post"
* Tiny ask: "I can send a few example posts for your feedback"
Example 3 — Million dollar:
* Signal: headcount on LinkedIn (7 devs)
* Specific claim tied to third party: "You might qualify for the Canadian dev tax break"
* Dollar amount tied to their situation: "Up to a million over two years"
* Pain it connects to: "Series A — runway is a priority"
* Zero risk ask: "Doesn't cost anything to check"
The pattern across all 3 is: they spot something specific, ask or state something that only an insider would know, then make the ask feel like the obvious next step.
```

### 4.7 MCA conversation (L1452-1506). BAD vs GOOD offer wording (MCA / business funding)

- BAD (company bio): "We're honest. 80% renewal rate. Five years in business. About $50 million funded per year." GOOD (offer): ""I can get you funded in under 24 hours with no credit checks."" GOOD fallback: free lead list / "a free credit line to age their business credit. Or a free qualification check." Leadbird = the author's past company.

```text
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
```

### 4.8 Ikeuchi segment language (L1698-1735). Owner: another agency's client (industrial humidification). NEVER reuse facts. Method is reusable

```text
What your buyer needs to hear
Hi Alexander,
Working on Ikeuchi's campaigns, we found that the way we explained the product needed to change quite a bit between segments.
For printed circuit board manufacturers, we were writing about scrap and damaged components backing up at the rework station. For paint shops, we were writing about paint defects and contamination rework.
Ikeuchi sells humidification systems, so we had to explain why adding moisture to the air made sense for each buyer.
You can use the same process for your next sequence: start with what buyers say on calls, then use it to explain the offer.
Everything comes back to solving a specific problem for a specific person in a specific way.
If you're not being specific, no one's going to care.
Circuit boards: scrap, rework and moisture
In the circuit board campaign, the language included “scrap rate” and “rework station backlog.” Those describe what the problem means to someone dealing with damaged boards on an assembly floor.
We also had a concern to address: “Can't mist near the line.”
If we're adding moisture near circuit boards, we need to answer that concern. The buyer needs to know whether our solution could damage the thing they're trying to protect.
So the copy used “non-wetting humidification” and explained what that meant for their boards: add moisture to the air without getting them wet.
Then we offered a way to examine it in their own space:
“We'll set up a trial area so you can see the before and after.”
Paint shops: defects and contamination
The paint-shop copy opened with a different question:
“do you guys still experience dust contaminations and fisheyes in your paint booths?”
Here, we were talking about paint defects. The email explained the dry-fog offer in terms of dust getting onto panels while they were being painted.
Later in the sequence, we asked to reach whoever was dealing with “the daily headache of fisheyes and contamination rework.”
That email was aimed at the person responsible for paint quality or production.
How to find the words for your next sequence
We checked what belonged in these emails against what our reps heard on calls, sales transcripts, and complaints in relevant Reddit forums.
1. Talk to the people taking the calls
If you're doing this for your own company, start with the people having the conversations.
Ask your reps what keeps coming up when they explain the offer. Have them talk you through the objection, what the buyer was worried about, and what they said in response.
You want the details they remember from actually being there.
2. Read the transcripts and buyer complaints
Then go back through the transcripts. Look for the way buyers describe the problem before your salesperson introduces their own wording.
You're not a doctor, okay? You're ultimately a salesperson, so you need to listen to how they're feeling and let them tell you what's wrong, and then use that language.
For the circuit board offer, you'd be looking for whether they're talking about scrap, rework, or moisture near the line.
Use relevant Reddit discussions to find more of that language. Save the complaint with its context so you don't put a paint-shop concern into an email about circuit boards.
3. Answer the objections you keep hearing
When an objection keeps appearing, check whether the product genuinely addresses it. If it does, explain that in the email before asking the next buyer to consider a trial.
4. Read it out loud, then check it with your reps
Then read the email out loud.
It needs to sound like you're talking to someone at a bar. Repeating the buyer's words matters, but forcing terminology into a sentence makes the offer harder to follow.
Before your next sequence goes out, give it to the person who took those calls. Ask whether it describes the problem the buyer brought up and answers their concern.
```

### 4.9 100 one-line cold offers (L1738-1837)

- **Label: GOOD as offer-shape examples** (specific observation + concrete offer + risk reversal + small ask, mostly 20-35 words). Owner: generic/external. **Every number, name, city and phone number is illustrative, never a fact.** Watch-outs:
  - many end on a statement, not a one-word question
  - #5 has a phone number and "call ... right now" (hard ask)
  - #15 and #57 make "pre-approved" / financing claims (compliance risk, Lex)
  - #25, #45, #74 use fear/security claims (only if literally true)
  - #18 and #19 carry guarantees
  - #55 is about poaching a competitor's CFO

```text
1. I've got a commercial electrician with 8 years on the tools looking for work in Phoenix this week. Want his details before I send him to someone else?
2. Do you have invoices sitting past 60 days? We take 20% of what we collect and nothing on what we don't, and most of it's back in your account within three weeks.
3. We run Google Ads for a roofer in Tempe and they've got more jobs than their crew can cover. If you've got capacity I'll send the extra work your way.
4. I'm working with a father and son who want to buy a plumbing company in Las Vegas, cash and a quick close. If you'd sell at the right number, worth a chat?
5. I called your shop twice after 5pm yesterday and got voicemail both times. I'll set you up with a 24/7 receptionist free to test, just call 339 440 4002 right now and hear how it handles it.
6. I looked up your card processor's published rates and you're paying about $1,400 a month more than you need to. Want the breakdown? Costs you nothing either way.
7. Mike's Plumbing is sitting above you on Google for "plumber Sacramento" and taking the calls that should be yours. Want me to show you exactly how they got there?
8. Are your books current for tax season or a few months behind? We'll catch you all the way up first and you only pay once you're caught up.
9. I pulled your warehouse roof on satellite and it looks like you'd save about $22,000 a year on power with panels. Want me to confirm the exact figure?
10. I've got truck space running empty from Dallas to Atlanta twice a week. Ship that lane with me and I'll beat your current rate by 15%.
11. Whoever cleans your office now, I'll do the first two weeks free so you can compare. No contract until you're happy with it.
12. I checked what businesses your size pay for liability cover and you're overpaying by around $600 a month. Send me your renewal and I'll show you where.
13. I noticed your team's still on QuickBooks Desktop. We moved a contractor just like you off it last month and halved their monthly software bill.
14. Your site takes 9 seconds to load on mobile and most buyers leave after 3. I'll have it under 2 by Friday and you only pay if it's faster.
15. You're pre-approved for up to $80,000 in equipment financing at 6.9% with nothing down. Want to see the monthly before you decide?
16. How many hours a week does running payroll eat? We take it fully off your plate for less than your current provider charges.
17. The software you build likely qualifies you for around $40,000 in R&D tax credits you've never claimed. We only get paid a slice of what we actually recover.
18. I can get your company into a Forbes contributor piece within 30 days. You don't pay unless it's published and live.
19. Your Google rating slipped to 3.9 last month and it's quietly costing you calls. I'll get you back above 4.5 in 60 days or you don't pay.
20. Three solid people applied for a warehouse manager role we already filled. Rather than waste them, want the best two sent over?
21. I've got a tenant ready to sign for 4,000 square feet of retail near your building. Do you have anything coming available?
22. We supply the same lumber your yard buys at 12% under what you're paying now. Send me one recent invoice and I'll prove it.
23. I'll shoot and edit one promo video for your dealership for free. Like it and we talk, if not you keep the video anyway.
24. I represent a European distributor looking to buy 20 containers a year of product like yours. Are you set up to export?
25. I ran a quick scan and one of your customer login pages is exposed. I'll show you exactly where for free, before someone less friendly finds it.
26. Half the emails your sales team sends are landing in spam and nobody there knows. I'll prove it in five minutes and fix it this week.
27. Give me 30 minutes with your P&L and I'll find at least $5,000 a month you're leaking. If I can't, the call's on me.
28. I'll book qualified sales calls straight onto your calendar and you only pay for the ones that actually show. No retainer.
29. Your top listing is missing the one keyword your competitors rank for and it's costing you sales daily. Want me to send you which one?
30. You're paying for clicks on "free" and "cheap" searches that never buy. I'll cut that waste and move the budget to people ready to spend.
31. I wrote you a full article targeting "best CRM for plumbers" and it's ready to publish. Want to read it before I offer it to anyone else?
32. I'll give you a trained assistant free for one week. Hand them your worst admin task and see what comes back.
33. Your business loan is likely sitting two points above what you'd qualify for today. Want me to check what refinancing saves you?
34. Whatever you pay for uniform and linen service now, I'll undercut it and cover the switchover. First month's on me.
35. I'll treat your restaurant kitchen once for free before you commit to anything. If the problem comes back, so do I, at no charge.
36. I looked at your dumpster setup and you're paying for pickups you don't need. I can cut that bill about 30% without changing a thing you do.
37. Your business phone bill is probably double what it should be for your size. Send me last month's and I'll show you the cheaper setup.
38. I'll install EV chargers at your property at no upfront cost and you keep a cut of every charge. Want the numbers for your lot?
39. I mocked up a new sign for your storefront and it looks sharp. Want me to send the design? Free to look.
40. I'll cater lunch for your office once for free so your team can taste it. If they love it we talk about your standing order.
41. I drove past your lot and counted three blind spots a camera would cover. I'll do a full site assessment free this week.
42. Your landscaper's contract is up soon and I'll beat their price with the first cut free. Want a quick quote?
43. Your rooftop units are the type that fail in the first heatwave without servicing. First inspection's free and you decide from there.
44. Send me the contract you're about to sign and I'll flag anything risky for free. If it saves you trouble, we can talk about the rest.
45. Someone just filed a trademark close to your brand name and it could block you. I'll show you the filing free so you can decide what to do.
46. Your business likely qualifies for a $25,000 government grant that closes next month. We only get paid if the money actually lands.
47. I've got someone with capital looking to open a franchise like yours around Denver. Are you expanding, or know someone who is?
48. Want to offer your customers monthly payment plans while you still get paid in full upfront? Costs you nothing to add and bigger jobs start closing.
49. I'll make three short videos of someone using your product for free for you to run as ads. If they sell, we make more.
50. I built a working prototype of the booking app you mentioned wanting. Want to see it run before we talk cost?
51. Your practice is probably leaving 8% of claims uncollected through coding slips. We recover it and only take a cut of what we find.
52. Your commercial power contract renews in March and rates have dropped since you signed. I can lock a lower one now before they climb back.
53. I've got buyers in Mexico asking for products like yours but your site's English only. I'll translate your top page free to prove the demand.
54. Your employee handbook is likely missing two clauses that expose you in a lawsuit. I'll point them out free, fixing them is up to you.
55. I'm sitting on a CFO who just left your biggest competitor and is quietly looking. Want a private conversation before she signs elsewhere?
56. You're invisible in the map pack for your own town and a competitor owns it. I'll send the three fixes that close the gap, free.
57. You qualify for up to $50,000 in working capital in your account within 48 hours, no personal guarantee. Want the terms?
58. You've got a build wrapping soon that'll need cleaning before handover. I'll quote it now and do a sample room free.
59. Your trucks are buying fuel at full retail. I can get you a fleet card saving about 22 cents a gallon starting next week.
60. Your site has no way to catch visitors after hours and they're leaving. I'll put an AI chat on it free for two weeks so you see the leads it saves.
61. I'll send a free pallet of our product to your store. Sell it and we talk about a standing order, no risk to you.
62. You've had a "now hiring" sign up for two months. I'll fill that role on a guarantee, no placement no fee.
63. I can put panels on your roof at zero cost and you just buy the power cheaper than the grid. Want me to run your building's numbers?
64. You're losing money to chargebacks you could be disputing and winning. We fight them for you and only get paid on what we recover.
65. Your team's booking flights at retail through random sites. I can cut your travel spend 18% and handle every booking.
66. I'll write and post under your name on LinkedIn for a week free. If your inbound goes up, we keep going.
67. I'll fund your next big inventory order so you don't tie up cash, and you pay once it sells. Want to see how it works?
68. Your industry's getting audited hard this year and one missing log is a five figure fine. I'll do a mock inspection free and show you the gaps.
69. I can match your current packaging exactly at 14% less per unit. Send me one box and I'll quote it this week.
70. I've got two licensed plumbers ready to start near you. You only pay if one's still with you after 90 days.
71. You've got a fake one star review dragging your rating down. I can get it taken down and you only pay once it's gone.
72. I'll send a sample gift box to your office free. If your clients would love it at the holidays, we scale from there.
73. I built a list of 500 dental offices in Texas matching your exact buyer. Want a free sample of 25 to test before you take the rest?
74. Your competitor down the road got hit with ransomware last month. I'll run a free risk check on your setup before you're next.
75. I've got a lender ready to fund your expansion on terms your bank won't match. Worth 15 minutes to compare?
76. You're packing orders by hand and it's capping your growth. I'll fulfill your next 100 orders free so you feel the difference.
77. I've got three CDL drivers with clean records looking in your region right now. Want them before the other carriers call?
78. Search your company name and the second result is hurting you. I can bury it and you only pay once it's off page one.
79. I can cut your health insurance renewal by adding a wellness program that pays for itself. Want me to model it against your current plan?
80. Your CRM and your invoicing don't talk and your team's double entering everything. I'll connect them free as a trial.
81. We generate personal injury cases and have more than our firm can take this month. Want the overflow signed and ready?
82. Your building's exterior is the first thing clients see and it's looking tired. I'll quote it free and throw in the pressure wash.
83. Give me your last 12 months of supplier invoices and I'll find savings or I work for free. Most clients see 9% back.
84. I've got a senior developer in your timezone who just came free and works for half a US salary. Want the intro?
85. I've got a prime booth opening at the trade show your buyers attend. Want it before I offer it to a competitor?
86. Your repeat customer rate is lower than it should be and keeping them is cheaper than chasing new ones. I'll set up the system free for a month.
87. After that last storm your flat roof likely has damage insurance would cover. I'll inspect it free and handle the claim if there is one.
88. I can book you on five podcasts your buyers actually listen to. You don't pay until you're recording.
89. Your returns are eating more margin than you think. I'll audit one month of them free and show you where it's leaking.
90. Your office is bleeding money on toner and per page costs. I'll audit your printers free and usually cut that bill by a third.
91. Your showroom floor is scuffed and it's the first thing buyers notice. I'll lay a sample section free so you can see the finish.
92. I'll audit your water, gas and electric bills for billing errors. We split whatever refund I claw back and you risk nothing.
93. I've got an audience of 30,000 contractors I can send to you on commission only. You pay per sale, nothing upfront.
94. Most businesses your size are owed a workers comp premium refund and never claim it. I'll check yours free and only take a cut if money comes back.
95. I've got a controller with 10 years in your exact industry on the market this week. Want first look before I shop her around?
96. Your sales emails all come from one domain and one wrong move burns it. I'll set up backup sending infrastructure free for a month.
97. I'll install a premium coffee setup in your breakroom at no cost and you keep a cut of every cup. Want it in before the holidays?
98. My clients keep asking me for someone who does what you do and I've got nowhere to send them. Want to be who I recommend?
99. I can move the dead stock tying up your shelf space and cash. You only pay me a cut of what actually sells.
100. I've got a vetted executive assistant who can start Monday in your city. Try her a week and only keep going if she's a fit.
```

### 4.10 Cold Email Template Library (L2224-2893). Verbatim, by category, with labels

Owner of named facts: other agencies and courses (ListKit, Closers.io, Mailshake, Russell Brunson/Clickfunnels, "Klaudia", "Jared", "Sanjeet", "serrala", "John", "Sample Company", "ABC Marketing", "BAC Corp", "DTC 123", "Contractor A", "COMPANY A"). **All are placeholders or other companies' proof. Never reuse.**

#### 4.10.0 Header and 00 Frameworks (subject lines, CTA bank, P.S. bank, frameworks, lead magnets, personalisation, offer ideas, writing rules)

```text
Cold Email Template Library
Organized into the category structure requested: Frameworks, Master Templates, Offer-Specific Index, Niche Index, and Archive Recommendations.
Section
	Purpose
	What is inside
	Section
	Purpose
	What is inside
	00
	Frameworks
	Subject lines, CTAs, P.S. lines, lead magnet logic, personalization, offer ideas, training notes
	01
	Master Templates
	Full scripts grouped by campaign type
	02 / 03 / 99
	Indexes
	Offer-specific mapping, niche mapping, and archive guidance
00 - Frameworks
Subject Line Types
• Desired Outcome: Helping your team with (outcome); Need more (outcome)?; Looking for (outcome)?; More (outcome)?
• Pain: Have trouble with (problem)?; Not enough (problem)?; Low reply rates?
• Reference: Congrats on (accomplishment); Just saw (case study); Enjoyed (accomplishment)?
• Curiosity: Quick question (first name); Real quick; Have you seen this (first name)?; Thoughts (first name)
Subject Line Examples
• Quick Question
• {FIRST_NAME}?
• thoughts {FIRST_NAME}?
• have you seen this {FIRST_NAME}?
• question {FIRST_NAME}
• can I get your opinion {FIRST_NAME}?
• opinion {FIRST_NAME}
• [your service] question
• question about [your service]
• [your service]?
• our [your service]
• {RESTAURANT}'s food - yes or no?
• {RESTAURANT}?
• re:[your service]
• [service]
CTA Bank
• Hard: Worth a chat?; Opposed to a 15-min chat?; Mind if I send over some times for a quick call?; Let's do a call this week?; Is this worth a discussion to you?; Is [phone number] the best number to reach you?
• Soft: Open to hearing more?; Curious to see how?; Interested in learning more?; Thoughts?; Interested?; Want to try it out?; Open to a quick demo?; Can I send a strategy I made for you?; Can I send over some samples?; Would you be interested in speaking?
• Softest: Is [result] a priority right now?; Would you be the right person to speak to?; Mind if I send more info?; Can I send more info?; Is this the best place to send it?; Do any of these look like a fit we could discuss with your team?
Top 16 CTA Shortlist
• Would you like to see a quick video explaining further?
• Any interest in discussing this further?
• Is this something you'd be open to learning more about?
• Who might be the best person to get in touch with at COMPANY to discuss this further?
• Do you have 12 minutes this week for a call?
• Would you be opposed to a quick call to discuss further?
• Is this worth exploring?
• World's worst idea to discuss further?
• Mind if I share a video explaining my thoughts?
• Is now a better time to discuss XYZ?
• Mind if I send over some more info?
• Would you like to hear a strategy that can help you accomplish XYZ?
• I put together a resource for you. Mind if I share it with you?
• I had some ideas I wanted to run by you. Mind if I share a video explaining further?
• If we can help you accomplish XYZ, would that be worth discussing further?
• (case study) - Open to discussing how you can accomplish something similar?
P.S. Line Bank
• Relevant/Personalized: I know you get a ton of these so I wanted to make it relevant to you.; We can give you a free trial, no strings attached if you'd like.; I'm sure you get a million cold emails/day, so I thought the subject line might stand out to break the ice!; no obligations afterward, it's just a gesture of good will.
• Case Studies: We just helped our client close a $100k deal using this lead list building strategy.; We just helped [case study] get 14 of them in January!; We recently featured {CASE} and {CASE} in our newsletter and received tons of new users.; Our UGC has helped 20 other DTC brands generate an extra $2.7M in the last 3 months.
• RR/Guarantee: If you don't see a traffic increase in the first 90 days of working with us, you don't pay a dime.
• Opt-out: Or feel free to tell me to pound sand...
Core Frameworks
• Base 1: Hi Name, I noticed you on X and I'm reaching out because of Y. We USP that solves Z in Timeframe without No good rotten thing. Offer something for free.
• Base 2: Hi FNAME - if we could {OFFER}, would you be interested? Signature. P.S. with Case study.
• Ultimate Cold Email Sequence: Email 1 = relevant first line + case study + CTA; Email 2 = new first-line variation + more proof + softer CTA; Email 3 = right-person check.
Lead Magnet Theory
• A good lead magnet solves a narrow problem for the lead, then introduces a new problem solved by the offer.
• Ranking by perceived value: Level 1 = White paper, Webinar, Mini Course, E-Book, Templates, Survey. Level 2 = Samples, Free Trials, Free Tools, Free Evaluation. Level 3 = Leads, Calls Booked, Ad creatives, Listing Optimization, Service Sample, Free Course, Free Software, Landing page for free.
Personalization Ideas
• Find website visitors
• Employee 1 or 2
• Find competitors
• Find ads / generate ideas / write an icebreaker
• Personalized from website or LinkedIn
• Case study / customers
• Suggest leads
• Potential clients
• Recently left jobs
• Funding
• Restaurants
• Check for SEO
• Product call-out
Offer / Lead Magnet Ideas by Service
• PPC: 5 personalized ad creatives based on top competitors; Google Ads audit + one rewritten campaign structure; 3 retargeting concepts; 3 scroll-stopping hooks; free campaign build; database reactivation.
• SEO / SEO AI: 10 intent-clustered keywords; 5 backlinks you're missing; AI GPT audit.
• Web Dev / CRO: 1-page redesign; free wireframe; free landing page; broken feature repair; free website mockup; free speed optimization.
• Lead Generation: 1,000 free leads; free email script; book a call for them; database reactivation.
• Content / Video: free video; 2 short-form edits; one podcast to content conversion; free UGC; hook testing.
• AI: free AI build; free demo; one automation flow; free chatbot; free automation setup.
• Amazon: free listing rewrite; one PPC campaign build; keyword teardown; backend keyword update.
• Software Dev: free MVP scope doc.
• Print / Direct Mail: one free mailer design; free printed sample pack; one free postcard mockup.
• Branding / PR: press pitch template.
Writing Rules / Training Notes
• Keep scripts below a 3rd-grade reading level when possible.
• Make scripts as short and simple as possible without losing the core value.
• Use 5–6 touchpoints across LinkedIn, SMS, call, and email.
• Test multiple angles in Email 1 and scale winners.
```

#### 4.10.1 Desired Outcome

| Template | Label | Why |
|---|---|---|
| Need more ICP Leads? | MIXED | Good relevance; stand-alone "Worth a chat?" is Archive-generic |
| Short Email 1 | BAD | Archive "Too Generic" (vague benefit + chat) |
| If I could help is that useful? | BAD | Too generic |
| If I could show you result in time with USP | BAD | Archive "broad 'We help X get Y in Z time'" + call ask |
| If I could result, interested? (Case Study PS) | GOOD | Base 2 shape; proof sits in the P.S. |
| Visibility on Amazon / Product Ranked Higher Amazon | BAD | Generic, no proof |
| Wasn't sure if you're doing this already? | MIXED | Offer + proof shape; "Got time this week" call ask |
| Tired of pain? | BAD | Hype ("I made a system"), 15-min call ask |

```text
01 - Master Templates
Desired Outcome
Primary category for the scripts listed below.
Need more ICP Leads?
{FIRST_NAME} - could {COMPANY} use more {ICP} leads each month?
Only asking because {Distinct value prop with social proof}.
Worth a chat?
Short Email 1
Hey {FIRST_NAME},
If we could get you {BENEFIT} - would that be worth a chat?
If I could help is that useful?
Hey {FIRSTNAME} - {relevant first line or fall back line}
If I could help {insert messaging about how you help}, is that something you'd be interested in hearing more about?
If I could show you result in time with USP
If I could show you how to get RESULT within TIME using USP - would that be worth a quick chat?
If I could result, interested? (Case Study PS)
Hi {FIRST_NAME} - if we could RESULT, would you be interested?
&signature%
P.S. CASE STUDY HERE
Visibility on Amazon
Hey {FIRST_NAME},
If I could increase {{company_name}}'s visibility on Amazon to drive more sales, would that be worth a chat?
Product Ranked Higher Amazon
Hey {FIRST_NAME},
Would it be okay if we get {[company_name}}'s products ranked higher on Amazon to increase sales and visibility?
Wasn't sure if you're doing this already?
Hi {FIRST_NAME}, not sure if you're doing this already, but we have a way to get QUANTIFIABLE RESULT using USP for your COMPANY TYPE.
We just did it for CASE and it generated RESULTS for them.
Got time this week to learn more about it?
Tired of pain?
{FIRST_NAME}, tired of PAIN?
I made a system that SOLVES PAIN & generates RESULT.
Got 15 minutes to learn more this week?
```

#### 4.10.2 Pain / Problem

| Template | Label | Why |
|---|---|---|
| PTB Looking to Solve | MIXED | Poke-the-bear shape; "achieve {OUTCOME} in {TIMEFRAME} without ..." line is Archive-generic, needs real proof |
| How are you managing pain? | GOOD | Question → who we help → proof → soft CTA |
| Facing Problem? Steps 1+2 | GOOD | Step 1 question, Step 2 proof |
| Google Page Speed | MIXED | Knowledge-as-proof; call CTA |
| AI Website Speed | MIXED | "worse than 87.6%" only if a real test exists |
| Review Call Out | MIXED | Good observation; generic middle line |
| SEO Comp Outrank with Case Study Step 1 + 2 | GOOD | Observation → proof follow-up → audit CTA ("ABC Marketing 23% / $43,000" placeholder) |
| High Turnover / Staffing Template | GOOD | Signal + pain question + proof + resource CTA |
| Ad Creative Gap Template | GOOD | Knowledge + free sample + P.S. proof |
| Saw you aren't using USP Video | MIXED | Archive duplicate concept (video ask) |
| Page Speed Report Lead-In | GOOD | Only with real measured numbers |

```text
Pain / Problem
Primary category for the scripts listed below.
PTB Looking to Solve
Hey {FIRSTNAME} - {relevant first line}
{poke the bear question}
We're helping companies like {COMPANY} achieve {OUTCOME} in {TIMEFRAME} without {no good rotten thing}.
Would this be something you're looking to solve as well?
How are you managing pain?
Hey {{firstName}}, are you guys experiencing {{pain point}}/how are you guys managing {{pain point}}?
The reason I'm asking is because we help {{job title}} at {{subniche}} solve {{pain point}} by {{offer/product}}.
We recently helped {{case study}}.
Is this something of interest?
Facing Problem? Steps 1+2
{FIRST_NAME} - are you facing the same problem as other {TITLE} are?
Hey {FIRST_NAME} Only asking because we helped CLIENT drive RESULT in TIME, and we think we can do the same for you.
Google Page Speed
Hey {FIRST_NAME}, I checked {COMPANY}'s Google Page Speed analytics, and your results came back at {STAT}/100.
Usually, you want to be over 85 for online stores like yours which isn't too hard to get.
Would you be open to a quick call for me to show you how to achieve that?
AI Website Speed
Hey {FIRST_NAME}, your website speed is worse than 87.6% of your competitors based on a test our dev team just conducted.
We developed AI software that can drastically improve this so you can increase your sales and make money. Want to try it out?
Review Call Out
Hey {FIRST NAME} - I saw the great review {NAME} left out {AI SUMMARY OF REVIEW}.
Are you thinking about ways to keep the great reviews coming?
We're helping companies like {COMPANY} achieve {OUTCOME} in {TIMEFRAME} without {NO GOOD ROTTEN THING}.
Would this be something you're looking to solve as well?
SEO Comp Outrank with Case Study Step 1 + 2
{FIRST_NAME},
I noticed {COMPANY} is being outranked by {COMPETITOR1} and {COMPETITOR 2} on Google for searches like {KEYWORD}.
Open to seeing how you can win some organic traffic back?
1. Hi {FIRST_NAME},
The reason I ask is because we helped ABC Marketing increase site traffic by 23%, leading to an additional $43,000 in revenue last month - and are confident we can help you do the same.
Can I send an audit of where {COMPANY} can improve on Search?
High Turnover / Staffing Template
Subject line: {{function}} turnover
{{first name}} - saw your {{department}} team has grown to {{team size}} people recently.
High turnover in {{department}} can be brutal - are you finding candidates who actually stick, or still cycling through people?
Asking because we just helped {{similar company}} reduce their {{department}} turnover by {{percentage}} by finding candidates with {{specific qualification}}.
Worth sharing what we learned about sourcing people who actually stay?
Ad Creative Gap Template
Subject line: {{company}} ad creative
{{first name}} - just scrolled through {{Company}}'s ad library.
Noticed you aren't using {{specific creative format}}. Can I make you a sample one?
PS - Only asking because we just made one for DTC Brand A, and it was their winning creative over BFCM.
Saw you aren't using USP Video
Hi {{firstName}}, just saw you aren't {using some sort of mechanism}
Mind if I send you a video we put together covering {outcome} using {mechanism}? Just let me know and I'll send it over
Page Speed Report Lead-In
Subject line: {{company}} page speed
{{first name}} - just ran {{Company}}'s website through a speed test.
Your homepage is loading in {{load_time}} seconds, which typically costs you about {{percentage}} of potential conversions.
I put together a quick report showing {{number}} specific fixes that could get you down to {{target time}} seconds.
Want me to send it over?
PS - Every second of load time costs about {{conversion impact}} in conversions on average.
```

#### 4.10.3 Lead Magnet

| Template | Label | Why |
|---|---|---|
| Lead Magnet - Hyper / Free Resource - Expect to Believe | GOOD | "I'd never expect you to believe me without giving you something first." |
| Lead magnet value prop? | MIXED | Two CTAs ("would you like to see it?" + "Worth a chat?") |
| Free Doc Link | BAD | Contains a link (Triple Tap "No links"), no question CTA |
| Straight Lead Magnet | GOOD | Level-3 lead magnet |
| Can I send lead magnet? | GOOD | Shortest permission ask |
| 3 Free Contacts | GOOD | Knowledge-as-proof; option 4 guarantee needs client approval |
| Free Sales Page Wireframe | MIXED | Call ask |
| Free Cold Call Sequence / Free Cold Call Script | GOOD | Free + P.S. proof ("72 prospects/calls" is another agency's) |
| Free UGC Content | MIXED | Negative observation, OK |
| DTC BFCM Free Test / DTC BFCM Free Videos | GOOD | Seasonal, free test, P.S. proof (placeholders) |
| Free Service Reactivation Example | "Old way" BAD, "New way" GOOD | The template itself labels them |

```text
Lead Magnet
Primary category for the scripts listed below.
Lead Magnet - Hyper
Hey {{first_name}} – I saw [something relevant to your message; be as specific as possible and think about the target].
We help companies achieve [results; primary value proposition. Come up with 2 variants].
But I'd never expect you to believe me without giving you something first.
I made you a [resource/lead magnet] and I wondered if you'd let me know if it was useful and then maybe we could chat?
Lead magnet value prop?
Subject: {LEADMAG}
{FIRST_NAME} - I just finished a report on {LEADMAG} - would you like to see it?
I know staying ahead of competitors like {COMP1} and {COMP2} is important, so I thought it'd be relevant to you.
Worth a chat?
PS- {Personalized line}
Free Resource - Expect to Believe
Hey {FIRSTNAME} - I saw {SOMETHING RELEVANT TO YOUR MESSAGE}.
We help companies achieve {results}.
But I'd never expect you to believe me without giving you something first.
I made you a {resource} and I wondered if you'd let me know if it was useful and then maybe we could chat?
Free Doc Link
Hey {firstName}, I put together a document/video that covers {painpoint} and {painpoint}. It breaks down the same process {case study} used to get {result} in {timeframe}.
Have fun - Link
Straight Lead Magnet
Could I send over 1,000 ideal customer leads similar to {CASE STUDY} (full name, email, company name, LinkedIn, etc.) for you to use in any outbound marketing efforts?
Can I send lead magnet?
{FIRST_NAME} - can I send you a {LEAD MAGNET}?
3 Free Contacts
Hi {FIRST_NAME},
We saw {COMPANY} on Clutch and noticed your impressive work with {{prospect_case_study}} in their marketing efforts. These are three contacts that fit the exact criteria of your past clients:
{{contact 1}}
{{contact 2}}
{{contact 3}}
1. We have a system that can get you in contact with 2,000 more leads each day. Is this something you might consider?
2. We'd love to offer you a free list of 5,000 high-quality leads tailored to {COMPANY}'s ideal customers. Would you be interested in a quick call to learn more about our system?
3. Our system can connect you with 2,000 high-intent leads daily, all on a pay-per-qualified-call basis. Would you be open to exploring this?
4. We can guarantee 5+ qualified calls within 30 days or you don't pay.
Free Sales Page Wireframe
{FIRST_NAME}, if we develop {COMPANY} a fully free & custom sales page wireframe to optimize for more conversions, would that be worth a quick brief call?
Free Cold Call Sequence
{FIRST_NAME} - super quickly - can I write up a 100% free cold calling sequence that you can use to bring in more prop management clients for {COMPANY}?
&signature%
PS: no obligations afterward, it's just a gesture of good will.
PPS: would be based on our best-performing cold calling script that got over 72 prospects for just one client in February…
Free Cold Call Script
Are you the best person at {COMPANY} to send a free cold calling script that you can leverage to get 50+ qualified leads every month?
Let me know, I can write it up for you today even
&signature%
PS: using this script framework we booked 72 calls in a single month for another marketing agency
Free UGC Content
{FIRST_NAME}, I see {COMPANY}'s UGC content isn't getting much traction, could we get one of our top creators to make you a free UGC video package for you to test with?
It would take 2-3 days - want to hear more?
DTC BFCM Free Test
{FIRST_NAME} - we've been helping DTC companies like BAC Corp increase CVR as much as 2x with AI-driven CRO.
Want to test it out over BFCM - no strings attached?
PS - We did this for DTC 123 for their 4th of July sale and their CVR increased from 1.5% to 2.25%, leading to an extra $37,500 in revenue that weekend.
DTC BFCM Free Videos
{FIRST_NAME} - I know it's November and DTC CMOs like you are busy getting ready for BFCM, so I'll keep this short:
Can we make you 2 free UGC videos you can run as ads this BFCM/Holiday Season?
PS - Our UGC has helped 20 other DTC brands generate an extra $2.7M in the last 3 months.
If you don't love each video, we'll redo it - no questions asked.
Free Service Reactivation Example
Old way: if we could help generate 1 - 5 clients every month with our [unique mechanism], would you be interested in speaking?
New way: {{name}} - when's the last time you reached out to past customers to bring them back in? I'd love to run a reactivation campaign for you completely free to book up your calendar over the next month.
Then, after determining they are qualified and can benefit, deliver the free service. After they are satisfied, ask about what else they are doing for marketing and if they want help.
```

#### 4.10.4 Video / Loom Ask (Archive: repeated "mind if I send a video?" = duplicate concept. Use one per sequence at most)

| Template | Label | Why |
|---|---|---|
| I just helped CASE, can I show you how? | MIXED | Generic "we helped case study" |
| Not sure about pain, video solution / Not sure if this is for you... | MIXED | Archive duplicate "not sure if this is for you" |
| Random 2m video | GOOD | Humanised, specific |
| Location Growth Partner to Video / Relevancy to Video | MIXED | Local frame; two-sentence CTA |
| We just helped CASE video explanation | BAD | Generic duplicate |
| Closers.io Loom Video Pitch | MIXED | Other company's offer and facts ("about 15 clients") |
| Trojan Horse Video Pitch | GOOD | Observation + free breakdown |
| HubSpot Automation Video Pitch | MIXED | Other company's proof (Russell Brunson); ListKit hard-coded |

```text
Video / Loom Ask
Primary category for the scripts listed below.
I just helped CASE, can I show you how?
Hey {FIRST_NAME} - {relevant first line or fall back line}
I recently just helped {case study company} accomplish {outcome} and I think we could do something similar for you.
Could I show you how it works?
Not sure about pain, video solution
Hi {firstName}, not sure if you're struggling with {pain}.
The reason I ask is we helped {case study} {transformation} in {timeframe} and made a quick video outlining how we'd do something similar for {{companyName}}.
Mind if I share it here?
Not sure if this is for you. Results with Case Study Video
Hi {firstName}, not sure if this is for you but figured I'd ask.
We were able to go from {insert own results} through {mechanism} and replicated this for {case study} who {transformation} in {timeframe} without {pain}.
Mind if I record a quick 3 minute video outlining how we'd do something similar for {company}?
P.S. Social proof, social proof, social proof.
Random 2m video
{name}, bit random but just recorded a quick 2 minute video for you on how you could {biggest transformation} in {timeframe} like we did with {case study}, mind if I send it over?
Location Growth Partner to Video
Hey {name},
We're a {local geographical place} based Growth Partner company that helps {sub-niche} {offer} without {painpoint}.
Would you like to see a quick video explaining further?
Then you can decide whether it makes sense for us to talk or not.
best, {your name}
P.S. We work on performance / {guarantee}
Location Growth Partner Relevancy to Video
We're a {local geographical place} based Growth Partner company that helps {sub-niche} {offer} without {painpoint}.
Mind if I share a quick video outlining a few ideas I had after looking at your {mention something relevant}?
Then you can decide whether it makes sense for us to talk or not.
We just helped CASE video explanation
{FIRST_NAME} - we helped CASE get RESULT using our USP.
Can I send a video explaining how it would work for {COMPANY}?
Closers.io Loom Video Pitch
Saw you're in charge of COMPANY social media.
I'll skip the fluff and get right to it:
We can drive millions of eyeballs for your company across social media (even if TikTok gets banned) with our Organic Viral Storytelling - consistently.
Your company will reach Gen Z with a new format that few businesses know about (we only have about 15 clients).
Interested in a quick Loom explainer going over a content strategy I mapped out for you?
Trojan Horse Video Pitch
I was checking out COMPANY website and I noticed a few things that are likely hurting your conversions with new customers.
I put together a quick video breaking down the causes and how to fix them, mind if I share the video?
HubSpot Automation Video Pitch
Hey as the founder at ListKit, I'm sure you are sick of setting up HubSpot workflows and sequences.
We recently did a full HubSpot build for Russell Brunson, and his sales team closed 10 extra deals from the automations we set up for him.
Mind if I share a quick video going over a HubSpot automation you can implement today to start closing more deals?
```

#### 4.10.5 Case Study / Social Proof

| Template | Label | Why |
|---|---|---|
| Leverage Case Study Guarantee | MIXED | "I guarantee" needs an approved guarantee; "15" call ask |
| Saw you helped CASE with Case Study | MIXED | OK shape |
| Growth Partner Case Study | GOOD | Specific; every name/ratio must be real |
| Not sure if this is for you. 3 competitors got solution | MIXED | Competitor proof must be true |
| My Co-Founder Found You | MIXED | Only if true |
| Introduction with plan and case study | MIXED | Skeleton |
| DTC Case Study | GOOD | Humour + proof + video CTA; guarantee P.S. needs approval |
| AI Workshop Local Proof | MIXED | Strong local proof; two CTAs |
| Nearby City Local Proof | MIXED | Weak CTA ("Let me know if you're interested") |

```text
Case Study / Social Proof
Primary category for the scripts listed below.
Leverage Case Study Guarantee
Hi {FirstName}, just saw your great work with {prospect case study}.
If we leveraged your case study with {case study company} I guarantee we could {offer}.
Just did something similar with {case study} who got {results} in {timeframe}.
Have you got 15 to discuss adding {offer}?
Saw you helped CASE with Case Study
Hi {firstname}, just saw you helped {case study}.
I wanted to reach out because we've been helping {sub-niche} with {offer} in {timeframe} without {pain}. Just helped {case study}.
Would love to show you my plan for getting you {desired outcome}.
Mind if I share it here?
Growth Partner Case Study
Hi name,
I currently am growth partner for {case study}.
Last year I took them from {transformation} in {timeframe}.
I've booked calls with companies like {company}, {company}, {company}, {company} and {company}.
Roughly 1/3 converted to qualified opportunities.
Mind if I share a doc I prepared for {company} on how we'd do something similar for you?
Not sure if this is for you. 3 competitors got solution
Hi {firstName}, not sure if this is for you but figured I'd ask.
We help {niche} to {offer} in {timeframe} without {painpoint}.
This is the same method other brands like {competitor 1}, {competitor 2} and {competitor 3} used to {desired outcome}.
Mind if I share some more info?
My Co-Founder Found You
Hi {firstName}, my co-founder, {name}, came across you when looking for a few {position} from {sub-niche} and asked me to reach out.
We created a doc on how {case study} went from {state A} to {stateB} in timeframe using {unique mechanism}.
It covers, {benefit}, {benefit} and {benefit}.
Mind if I share it here?
Introduction with plan and case study
Hi {firstName},
I'm {name}, the {position} here at {company}. We help {niche} {offer}.
As an example:
{plan}
We just helped {case study}
CTA
P.S. {guarantee}
DTC Case Study
Hi {FIRST_NAME},
I bet your inbox is as stuffed as turkey on Thanksgiving, so I'll carve out the details fast:
We helped Sample Company, another DTC beauty brand increase organic traffic by 37% with our DTC-specific organic SEO strategy.
Can I send a video on how?
PS - If you don't see a traffic increase in the first 90 days of working with us, you don't pay a dime.
AI Workshop Local Proof
Subject line: helping {{area}} companies with AI
{{first name}} - we just finished helping the owner of {{company}} (also in {{area}}) win 10 hours back per week with a basic, on-site AI training workshop.
Does that sound like something you could benefit from?
Asking because we're on-site with them and a few other {{area}} business owners, and wanted to see if you'd be interested as well.
Worth a chat?
Nearby City Local Proof
{{firstName}} - noticed you're in {{city}}. I live {{in nearby area}}.
Thought it might be interesting to speak on {{what you do}}.
We've helped other {{city}} area businesses {{drive results with it}}, so I figured I'd ask.
Let me know if you're interested.
```

#### 4.10.6 Interview / Whitepaper (research angle, no sell)

| Template | Label | Why |
|---|---|---|
| Interview White Paper / Sharing Interview White Paper / Interview Journey | MIXED | Soft research frame; long |
| Interview Our Founder soft CTA | MIXED | Hard-coded "John" |
| Personalized Interview No Sell | MIXED | Customer-research email ($100 gift card), not a cold sales email |
| Interview from friend mention | BAD | "a close friend of mine ... mentioned" is a deception unless literally true |
| Interview mention from our CEO | MIXED | Only if true |

```text
Interview / Whitepaper
Primary category for the scripts listed below.
Interview White Paper
Hi {{firstname}}, we're writing a white paper on leading {niche} like {company} and would love to ask a few questions about {your offer specific questions}.
Just interviewed with {company}, {company} and {company}.
Would you be open to having a quick conversation where we can cover some of the challenges and insights we've collected so far?
In exchange, I'll be happy to give you early access to the analyzed report and add a link to your website.
Let me know.
Interview Our Founder soft CTA
Hi {{firstName}}, our founder, John, came across you when looking for a few learning design leaders from {{industry}} companies and asked me to reach out.
We're arranging an executive orientation on How AI Is Changing The Learning Design Process And How You Can Use It To Empower Your Team.
Mind if I share more information?
Personalized Interview No Sell
Hey John - firstly, congratulations on the recent acquisition.
We're conducting a research project amongst our top customers. Your insights would be incredibly valuable.
It's a casual 45 minute conversation about your experiences with *product* over Google Meet (or Zoom if you prefer).
This is purely research - you will not be sold anything.
I know your time is valuable, so no worries if not - but we would be happy to offer you a $100 Amazon Gift Card in return for your time.
Interview from friend mention
Hi {{firstName}}, a close friend of mine from the {{industry}} industry in {{country}} mentioned I should reach out to you.
My team has been working with leading {{industry}} companies just like {{companyName}} who are interested in {offer/solving pain point}.
By way of introduction, I am the {position} at {company} a {one sentence offer/explanation}.
I'd love to trade introductions, share more about {benefit} and {benefit}.
Interview mention from our CEO
Hi {{firstName}}, our CEO, {name}, was talking about {{companyName}} and asked me to reach out to see if you'd be interested in a training we delivered to {company} and {company}.
We covered a few key topics such as {key topic 1}, {key topic 2} and {key topic 3}.
I'd love to set some time between yourself and {name} to discuss a session for {{companyName}}.
Sharing Interview White Paper
Hi {firstName}, I recently completed research for a white paper I was writing on how {sub-niche} is dealing with {problem} and {problem}.
Not sure if this is something of interest to you but figured I'd ask. Let me know and I'll send it over.
Interview Journey w/ Personalization
Hey {{firstName}},
{{personalization}}
I'm super impressed with what you've built with {{companyName}} and wanted to see if you'd be against doing a quick interview with me for a research paper we're writing about YOUR OFFER.
I'd love to hear about your journey at {{companyName}} and later share insights and strategies from similar companies that you're welcome to use.
```

#### 4.10.7 Referral / Right Person

| Template | Label | Why |
|---|---|---|
| Note for NAME LEADS? | GOOD | Right-person + proof + resource |
| Ultimate Cold Email Sequence Email 3 | GOOD | Step 3 right-person check |
| Ideas for Employee 1 or 2 | GOOD | 3 concrete ideas |
| Wasn't Sure ... (problem facing?) / (case study) | GOOD | Short; "COMPANY A 19 leads in 45 days" placeholder |

```text
Referral / Right Person
Primary category for the scripts listed below.
Note for NAME LEADS?
Subject: note for {FIRST_NAME} and {COLLEAGUE}
{FIRST_NAME} - mind letting me know if you or {COLLEAGUE} is best to send this to?
I know you sell to {ICP}, and being that we just helped {CASESTUDY} {RESULT}, I figured the email script I used might be relevant to share.
Should I send it here or to {COLLEAGUE}?
Ultimate Cold Email Sequence Email 3
Hey {FIRST_NAME},
Since you are the {TITLE} at {COMPANY}, thought you would be the right person to reach out to regarding {your offer}.
Would you be the right person for this?
Ideas for Employee 1 or 2
Hey {FIRSTNAME} let me know if {full name employee 1} or {full name employee 2} would be better to speak to about this.
I had 3 ideas about how we could specifically help over at {COMPANY}
{idea 1}
{idea 2}
{idea 3}
Do any of these look like a fit we could discuss with your team?
Wasn't Sure If I Should Send to you or colleague (problem facing?)
Hi {FIRST_NAME}
Wasn't sure if I should send this to you or {COLLEAGUE}
Either way, we've been working with other {INDUSTRY} and they told us they're struggling with {PROBLEM}.
Is this something you're currently facing?
Wasn't Sure If I Should Send to you or colleague (case study)
Hi {FIRST_NAME}
Wasn't sure if I should send this to you or {COLLEAGUE}
Regardless, we just helped COMPANY A generate 19 meeting-ready leads in 45 days, and we feel we can do the same for {COMPANY}.
Can I send more info to you or {COLLEAGUE}?
```

#### 4.10.8 Local / Geographic

| Template | Label | Why |
|---|---|---|
| Nearby Area Local Template | GOOD | Yoga studio example (that business's facts) |
| Helping Area Companies with AI / Nearby Area Generic | MIXED | Duplicates of 4.10.5 |
| Comp 1 vs Comp 2 Google | MIXED | Generic middle line |
| Home Improvement Phone Number | GOOD (Email 1) / MIXED (Email 2 phone ask) | "Contractor A 8 roofing leads" placeholder |

```text
Local / Geographic
Primary category for the scripts listed below.
Nearby Area Local Template
Hi [NAME],
Noticed you're in the [area of city] area, so I thought I'd reach out.
We're a yoga studio located nearby at [address].
For [Company Name]'s next retreat or offsite, would you be interested in a group session?
Best,
[NAME]
PS - They're great for team bonding. [Past customer], an [area of city] business, just finished their 4th with us!
Helping Area Companies with AI
Subject line: helping {{area}} companies with AI
{{first name}} - we just finished helping the owner of {{company}} (also in {{area}}) win 10 hours back per week with a basic, on-site AI training workshop.
Does that sound like something you could benefit from?
Asking because we're on-site with them and few other {{area}} business owners, and wanted to see if you'd be interested as well.
Worth a chat?
Nearby Area Generic
{{firstName}} - noticed you're in {{city}}. I live {{in nearby area}}.
Thought it might be interesting to speak on {{what you do}}.
We've helped other {{city}} area businesses {{drive results with it}}, so I figured I'd ask.
Let me know if you're interested.
Comp 1 vs Comp 2 Google
Hey {FIRSTNAME} - {competitor 1} or {competitor 2} seem to be the closest choices customers can choose between from what I can see on Google Maps.
Are you thinking about ways to make the choice easier for those customers?
We're helping companies like {COMPANY} achieve {OUTCOME} in {TIMEFRAME} without {NO GOOD ROTTEN THING}.
Would this be something you're looking to solve as well?
Home Improvement Phone Number
Subject line: {{roofing/plumbing/electrical}}
{{first name}} - is getting more {{roofing/plumbing/electrical}} leads a priority right now?
Asking because we just helped Contractor A get 8 roofing leads in {{City}} last month.
Worth a chat?
EMAIL 2:
{first name} - happy to give you a quick call.
Is {{phone number}} the best number to reach you?
```

#### 4.10.9 Hiring Trigger

| Template | Label | Why |
|---|---|---|
| Hiring for SDR | MIXED | "make this role irrelevant and flood you with meetings" = hype |
| Hiring Relation to Offer | MIXED | "$100K+" claim needs proof |
| Hiring Agency Step 1 + 2 | GOOD | Offer + guarantee + proof + free candidate (guarantee needs approval) |

```text
Hiring Trigger
Primary category for the scripts listed below.
Hiring for SDR
Hi {FIRST_NAME}, noticed that {COMPANY} still hasn't found a {POSITION} - bummer.
I run a cold email automation tool that can make this role irrelevant and flood you with meetings.
Want me to send more info?
Hiring Relation to Offer
Hi {FIRST_NAME}
I saw your Marketing Manager job posting and thought this would be of interest.
If we could help you save $100K+ on salaries by finding you English-fluent North American talent, like we did for ABC Corp. would you be interested in speaking?
Hiring Agency Step 1 + 2
Hi {FIRST_NAME}
Could {COMPANY} benefit from a full-time software engineer who speaks fluent English and works on EST for 1/3 the cost of an American FTE?
Only asking because we can staff {COMPANY} with one in under 30 days, guaranteed.
{CASE}, another startup in your space, said they're 4 weeks ahead on their product roadmap after working with us.
Can I send over one candidate for free?
```

#### 4.10.10 Competitor / Comparison. MIXED (no question CTA in the first one; hard-coded names; semicolon in "just say stop; thanks!" breaks the style rule)

```text
Competitor / Comparison
Primary category for the scripts listed below.
Competitive Research
Hi Jared,
We were conducting some market research on behalf of one of our clients in the {{industry}} industry and {{company_name}} came up. We've identified some offer-relevant ideas/opportunities that could be highly relevant for your business (including insights on {{competitor_one, competitor_two}}).
I'd love to share a few of these findings with you, especially around how [what we do] can help firms like yours [benefit].
Competitive Analysis Offer
Sanjeet, we've been doing some research into the space (you guys, {{serrala}}, etc.). Can be really tricky figuring out what the market actually cares about vs. what they don't but we landed on some interesting insights.
Wanted to reach out to see if you have any interest in hearing what we've found?
ps if this isn't relevant, just say stop; thanks!
```

#### 4.10.11 Audit / Research / Observation

| Template | Label | Why |
|---|---|---|
| Relevant First with Messaging | MIXED | AI skeleton |
| Ask Before Pitch | GOOD | Question first |
| Positive Personalized Vibes | MIXED | Long bracket options |
| Conversion Rate 3 Ideas Step 1 + 2 | GOOD | "Is here a good place to send them?" one-word CTA |
| Ecom Email Marketing Fix | GOOD | Knowledge-as-proof (opted into their list); "Klaudia" is another company's CEO |
| Saw your best performing ads | GOOD | Free concepts |
| Ad Library Review Sample | GOOD | Specific creative gap + sample |

```text
Audit / Research / Observation
Primary category for the scripts listed below.
Relevant First with Messaging
Hey {FIRST_NAME} - {recently waterfall or relevant based on first line}
{Messaging to be tested}
Specifically, I think it could help you {AI generated line about how this company could use it based on what the company does and the prospect's role}
If we could help you {messaging to be tested}, would that be useful?
P.S. {AI generated analogy}
Ask Before Pitch
Hey {{first_name}}, [open-ended question as CTA]
You're [trigger/observation]. [Potential problem deriving from Observation]
[How product solves Problem]
PS - Relevant because [personalization]
Positive Personalized Vibes
FIRSTNAME, I came across [PRODUCT NAME/COMPANY NAME] and checked out your guys' [relevant thing] – great stuff!
[BUT STATEMENT: I noticed a few small things that might be holding back your conversion rate a bit / I've been having conversations with other [INDUSTRY] folks about [PAIN POINT] – curious if you've had similar experiences?]
We've developed a solution here, could lead to a quick win. Mind if I send through my thoughts?
Conversion Rate 3 Ideas Step 1 + 2
Hi {FIRST_NAME},
I had 3 ideas for how we could increase Sample Company's conversion rate by 14% (like we just did for 123 Company).
Is here a good place to send them?
Reply version:
Here are 3 ideas we can implement for you in the next 30 days.
{IDEA1}
{IDEA2}
{IDEA3}
Would this make sense to discuss?
Ecom Email Marketing Fix
{{ |Hi|Hey|Hello}} {{firstName}}, I found your brand's profile on IG.
Our CEO, Klaudia, asked me to look for brands with real engagement on Instagram and go over their welcome experience.
It seems like you guys are crushing it on socials.
So, I opted into your email list to keep up to date on your latest offers and noticed some issues with your welcome flow that are likely impacting your conversions.
Mind if I share a Google Doc on how to fix them?
Saw your best performing ads
{{Hey|Hi|Hello}} {{firstName}},
Saw a couple of your best-performing ads and told my team to write out a few similar ones.
Concept 1
Concept 2
Concept 3
Mind if I send the exact creatives we would use for these ads?
Ad Library Review Sample
Subject line: {{company}} ad creative
{{first name}} - just scrolled through {{Company}}'s ad library.
Noticed you aren't using founder-forward video creative with heavy retention editing.
Can I make you a sample one?
PS - Only asking because we just made one for DTC Brand A, and it was their winning creative over BFCM.
```

#### 4.10.12 Guarantee / Risk Reversal

| Template | Label | Why |
|---|---|---|
| Guarantee / risk reversal example (ListKit) | MIXED | Pay-on-results, only with approved guarantee |
| TikTok guarantee example | BAD | Archive "extreme guarantees" |
| Dual layered guarantee | MIXED | No guarantee actually stated |
| SMS appointment setting flow | MIXED | "extra 10 meetings" must be provable |

```text
Guarantee / Risk Reversal
Primary category for the scripts listed below.
Guarantee / risk reversal example
Hey I noticed you're in charge of ListKit's marketing.
We can guarantee you 15 demos per month from cold email - you don't pay us until we hit 15 meetings scheduled.
Open to learning more?
TikTok guarantee example
We can get you 1 million views on TikTok in the next 90 days - guaranteed or else we'll send you a refund.
Open to hearing a TikTok marketing strategy I came up with for you?
Dual layered guarantee
We can clip up your recent podcast episode and turn it into 60 viral short-form videos.
Then, we'll post the clips on Instagram Reels, TikTok, YouTube Shorts, and Facebook - you don't have to lift a finger.
Open to seeing how it works?
SMS appointment setting flow
We can set up an SMS appointment setting flow for COMPANY that books you an extra 10 meetings per month.
Then we'll qualify the prospect based on their TechCrunch profile to make sure they are revenue qualified - so you only take qualified meetings.
Mind if I share a quick video explaining how this SMS process works?
```

#### 4.10.13 Follow Ups

| Template | Label | Why |
|---|---|---|
| Quick 1/2 Step | GOOD | Step 1 peer question + P.S.; Step 2 "The reason I ask" proof + Loom |
| Leaving Company Stoked | MIXED | Trigger-based; skeleton |
| Meme Resonation | MIXED | Humour; images UNKNOWN in EmailBison |
| Added Context (Objection) | GOOD | Step 2 clarify job |
| As I mentioned result | BAD | "As I mentioned in my first email" ~ banned "I am following up"; pushy question |
| Closers.io Email 1A-3 | MIXED | Other company's sequence; 1C/2B guarantees are Archive-hype |
| HubSpot Follow-up 2 / 2B / 3 | MIXED | Other company's proof (Russell Brunson, Clickfunnels) |

```text
Follow Ups
Primary category for the scripts listed below.
Quick 1/2 Step
Step 1:
Quick question
Hi {FIRST_NAME},
I talked to a few other $10M/year CMOs, and many of them are struggling to crack Tiktok Shop.
Same case for Sample DTC brand?
PS- saw your LinkedIn post about hiring CS, how's the search going?
Step 2:
Hi {FIRST_NAME},
The reason I ask is we've been helping DTC brands like Case Study 1 add an additional $75-$90k in monthly revenue with Tiktok Shop, and want to do the same for you, completely on performance.
Can I send a 5-minute Loom explaining how?
Leaving Company Stoked
Hey {FIRSTNAME} - I'd have to imagine you didn't leave {past company} stoked to worry about {problem}.
{Messaging to be tested}
No need to hop on a call, could I send a video of how it works?
Meme Resonation
Hey {FIRSTNAME} let me know if this meme resonates at all.
[Insert meme]
Jokes aside let me know if you'd like to connect re:{problem you solve}
Added Context (Objection)
Hey {FIRSTNAME} - to add some context, here is how we achieved {outcome}.
Item 1
Item 2
Item 3
Would it make sense to connect about this?
As I mentioned result
As I mentioned in my first email, one of our clients was able to {RESULT} in revenue from having us {SERVICE}. Are you guys not looking for {more clients/sign new policies}?
Closers.io Email 1A
SL: 1 million TikTok views for COMPANY
Saw you're in charge of COMPANY social media.
We can drive millions of eyeballs for your company across social media (even if TikTok gets banned) with our Organic Viral Storytelling - consistently.
Your company will reach a Gen Z audience with a new format not many businesses know about (we only have about 15 clients).
Interested in a quick Loom explainer going over a content strategy I mapped out for you?
Closers.io Email 1B
I was checking out COMPANY TikTok and I noticed a few things that are hurting your conversions with potential customers.
I recorded a quick video breaking down the causes and how to fix them, mind if I share the video here?
Closers.io Email 1C
Saw you're in charge of COMPANY social media.
We can drive millions of eyeballs for your company across social media (even if TikTok gets banned) with our Organic Viral Storytelling - fully guaranteed.
You'll get a million new potential customers seeing your content within 90 days.
Interested in hearing a TikTok Strategy I came up with for you?
Closers.io Email 1D
We can clip up your recent podcast episode and turn it into 60 viral short-form videos.
Then, we'll post the clips on Instagram Reels, TikTok, YouTube Shorts, and Facebook - you don't have to lift a finger.
Open to seeing how it works?
Closers.io Email 2
We can drive millions of eyeballs for your company across social media (even if TikTok gets banned) with our Organic Viral Storytelling - consistently.
Your company will reach a Gen Z audience with a new format not many businesses know about (we only have about 15 clients).
Interested in watching a quick video going over a TikTok strategy I had in mind for you?
Closers.io Email 2B
We can drive millions of eyeballs for your company across social media (even if TikTok gets banned) with our Organic Viral Storytelling - consistently.
You're even guaranteed 1 million views within 90 days, or we'll work at no charge until you hit it.
I recorded a quick video going over a TikTok strategy I had in mind for you, mind if I share it here?
Closers.io Email 3
I recorded a quick video going over a TikTok strategy that can get you 50k in new product sales in the next 90 days.
Mind if I share the video here?
HubSpot Follow-up 2
I recorded a quick video going over a HubSpot build we did for Russell Brunson, helping his sales team close 10 extra deals from the workflow we set up for him.
Mind if I share the video here so you can draw inspiration from it?
HubSpot Follow-up 2B
We can help you close 10 extra deals this month, fully guaranteed, by working as your Fractional HubSpot Manager.
You'll have all your automations and workflows built for you, and we'll optimize them to make sure you're not letting any deals slip through the cracks.
Mind if I share a quick video going over the HubSpot system we set up for Russell Brunson and Clickfunnels to see if this might be a good fit for you?
HubSpot Follow-up 3
I recorded a quick video explaining how we helped Clickfunnels close 10 extra deals last month by optimizing their HubSpot automations to book more calls for their closers.
Mind if I share the video here?
```

#### 4.10.14 General / Miscellaneous

| Template | Label | Why |
|---|---|---|
| Standard Email 1 | MIXED | Ultimate Step 1 skeleton |
| Standard Email 1.2 | BAD | Archive generic, no CTA |
| Founding Story / Founder Story with Custom Doc | MIXED | OK shape |
| Newsletter Publication | MIXED | Media offer |
| Market Research From Someone I'd Sell To / 2 Question | MIXED | Research angle (Mailshake = another company) |
| Why Isn't? Case Studies / 2 | GOOD | Knowledge-as-proof for agencies; guarantee options need approval |

```text
General / Miscellaneous
Primary category for the scripts listed below.
Standard Email 1
Hey {FIRST_NAME},
{AI generated first line that is very relevant to the prospect reading this email + also noting what you did for the competitor company}
{go more in-depth on the case study}
{CTA}
Standard Email 1.2
Hey {FIRST_NAME},
We help [COMPANY TYPE] get {RESULT} in {TIME}.
We recently helped {CASE STUDY}
Founding Story
Hey {FIRSTNAME} - {relevant first line or fall back line}
We started {your company name} because {tell a little bit about your founding story}.
Today we've helped companies like {case study} achieve {result}.
If we could help you do the same, would that be useful?
Founder Story with Custom Doc
Hi {{firstName}} ,
My name is X, I'm the founder here at Y.
We've been helping successful CEO's of {niche} companies {offer} in {timeframe} without {painpoint}
Just recently, we helped {case study}.
We've even put together a detailed Doc that outlines how we'd do something similar for {{companyName}}.
Is this the best place to send it?
Newsletter Publication
Hi FIRST_NAME,
We run a newsletter with 100k+ active subscribers interested in {{SEGMENT}} software.
Since COMPANY_NAME meets our criteria, I would be excited to get your company featured on our newsletter.
Up for a quick chat so we can arrange this?
Market Research From Someone I'd Sell To
Hey {FIRSTNAME},
Let me preface this by saying I'm not trying to sell you anything.
I was hoping to get some feedback from you as someone I would normally sell to…
I've started to build the sales team here at Mailshake. We're a competitor of tools like X, Y, and Z - I'm sure your team uses one of those.
I'm genuinely curious what - if anything - would it take for you to consider an alternative?
Market Research 2 Question
Subject: request for quote from {FIRSTNAME}
{First_NAME} - we are speaking with other {leadership type} leaders and were curious if we could get a quote.
No call is necessary; we just had two questions.
{question 1}
{question 2}
We are looking to share these answers from you and your peers anonymously in a report we are gathering together for the market.
Why Isn't? Case Studies
Hey {FIRST_NAME}, just curious why {COMPANY} isn't sending any cold emails?
With case studies like {CASE}, you could easily launch a case study campaign and get a couple meetings booked in.
1. I'd love to send over a free lead list of 1K leads including the decision makers of companies just like {CASE}. Interested?
2. Would you consider having us introduce you to 5-10+ potential clients similar to those in {CASE} for next month?
3. I'd love to share 2,000 targeted leads similar to {CASE} along with 3 custom-crafted email scripts to help you book 5-10+ potential clients next month.
4. Our system can connect you with 2,000 leads similar to {CASE} daily, exclusively on a pay-per-qualified-call basis. Would you mind if I made you a video explaining how?
Why Isn't? Case Studies 2
Hi {FIRST_NAME},
Just curious, why isn't {COMPANY} sending any cold emails? With case studies like {{case_study}}, you could easily launch a campaign and get a couple of meetings booked in.
1. We have a system that can get you in contact with 2,000 more leads each day. Is this something you might consider?
2. I'd love to send over a free lead list of 1K leads, including the decision-makers of companies just like {{case_study}}. Would you be interested in a quick call to learn more about our system?
3. Our system can connect you with 2,000 high-intent leads daily, all on a pay-per-qualified-call basis. Would you be open to exploring this?
4. We can guarantee 5 qualified calls within 30 days or you don't pay.
```

#### 4.10.15 02 Offer-Specific Index and 03 Niche Index (L2897-3006)
Names only. Several listed templates **do not exist in the doc**: Martech Quarter Meeting Generation, RB2B Usecase, PPC for Gyms, Creative Agency, Creative Agency 2, PR Agency B2B Tech, Sponsor Clutch, Email marketing free flow, Free homepage / mockup ideas, "DFW website / email marketing examples". They may be in the Notion playbook (L3912) = UNKNOWN.

```text
02 - Offer-Specific Index
Lead Generation
• Need more ICP Leads?
• Straight Lead Magnet
• Why Isn't? Case Studies
• 3 Free Contacts
• Growth Partner Case Study
• Martech Quarter Meeting Generation
• RB2B Usecase
PPC / Paid Ads
• Ad Creative Gap Template
• Ad Library Review Sample
• PPC for Gyms
• DTC BFCM Free Test
• DTC BFCM Free Videos
• Conversion Rate 3 Ideas Step 1 + 2
SEO / CRO / Web
• Google Page Speed
• AI Website Speed
• Free Sales Page Wireframe
• Page Speed Report Lead-In
• SEO Comp Outrank with Case Study Step 1 + 2
• Free homepage / mockup ideas
Email Marketing / CRM
• Ecom Email Marketing Fix
• HubSpot Automation Video Pitch
• HubSpot Follow-up 2
• HubSpot Follow-up 2B
• HubSpot Follow-up 3
• Email marketing free flow
Content / Creative / UGC
• Free UGC Content
• Creative Agency
• Creative Agency 2
• Closers.io Loom Video Pitch
• Ad Creative Gap Template
• Dual layered guarantee
AI / Automation
• Helping Area Companies with AI
• AI Workshop Local Proof
• AI Website Speed
• Free AI build/demo ideas
Amazon
• Visibility on Amazon
• Product Ranked Higher Amazon
• Free Amazon listing rewrite ideas
Hiring / Staffing
• High Turnover / Staffing Template
• Hiring for SDR
• Hiring Relation to Offer
• Hiring Agency Step 1 + 2
PR / Branding
• Competitive Research
• Competitive Analysis Offer
• PR Agency B2B Tech
• Press pitch template
Local Business
• Nearby Area Local Template
• Nearby Area Generic
• Helping Area Companies with AI
• Home Improvement Phone Number
• Comp 1 vs Comp 2 Google
03 - Niche Index
Agencies
• Need more ICP Leads?
• Sponsor Clutch
• Why Isn't? Case Studies
• Straight Lead Magnet
• HubSpot Automation Video Pitch
DTC / Ecommerce
• DTC BFCM Free Test
• DTC BFCM Free Videos
• DTC Case Study
• Ad Creative Gap Template
• Google Page Speed
• Page Speed Report Lead-In
SaaS
• HubSpot Automation Video Pitch
• Competitive Analysis Offer
• RB2B Usecase
• Newsletter Publication
Law Firms
• Hiring / staffing template variants
• Lead gen and intake-focused variants
Real Estate
• Home Improvement Phone Number
• Local / geographic variants
• Group retreat / experience style outreach if relevant
Home Services
• Home Improvement Phone Number
• Nearby city local proof
• Reactivation/free service lead magnet
Healthcare
• Medical service offer intros
• Outpatient / clinic lead magnet variants
Hospitality
• Nearby Area Local Template
• Hotel / restaurant offer intro variants
Local Biz
• Nearby Area Generic
• Helping Area Companies with AI
• DFW website / email marketing examples
Martech
• Martech Quarter Meeting Generation
• HubSpot automation variants
Amazon
• Visibility on Amazon
• Product Ranked Higher Amazon
```

### 4.11 03 Offer Examples (L3009-3268)

- MCA conversation: duplicate of 4.7.
- Slack ads bot, Nick Abraham thread (L3067-3137). GOOD method (one tangible free feature, go wide, DiscoGen keyword personalisation, non-decision CTA, let data pick). Owner: Nick Abraham's client.
- $25 gift card (L3138-3162) and AirPods math (L3168-3186). GOOD as offer-design ideas for Forge/Atlas; never added by Scribe on its own.
- "Dickie" site (L3187-3193). GOOD knowledge/permissionless ("just built you a site ... Should I send it here?"). Owner: another agency.
- Branded calling (L3194-3267). GOOD (anchor copy on the one different feature, prospect's own phone number as merge field). Owner: Nick Abraham's client ("CK Pools" example).
- "hey james" free website (L3268). GOOD (very short permissionless), all lowercase.

```text
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
```

### 4.12 Lead magnet levels and offer ideas by service (L3271-3357). Ideas for Forge, not proof

```text
04-
A good lead magnet solves a problem for lead who then introduces a new problem which is solved by your offer.
Make an offer so good, that people feel stupid for saying now
Lead Magnets:
Ranking- More perceived value more likely the sale
Level 1-
* White paper
* Webinar
* Mini Course
* E-Book
* Templates
* Survey
Level 2-
* Samples
* Free Trials
* Free Tools
* Free Evaluation
Level 3-
* Leads
* Calls Booked
* Ad creatives
* Listing Optimization
* Service Sample
* Free Course
* Free Software
* Landing page for free, if it converts 5% then you pay me
Agencies:
* PPC
   * 5 personalization ad creatives based on your top competitors
   * Google Ads audit + one rewritten campaign structure
   * Free performance projection using your current ROAS + market benchmarks (marketing titles)
   * 3 retargeting ad concepts (image + copy)
   * 3 scroll-stopping ad hooks
   * 1 free retargeting campaign build
   * Free Ad Creatives + Copy
   * We will build you a new ad campaign if it outperforms your current one you pay us $2500
   * Free Database reactivation - retargeting ads to existing leads, or previous calls who havent closed. (direct roi)
* SEO / SEO AI
   * 10 intent-clustered keywords for one product/service
   * 5 backlinks you’re missing
   * AI GPT audit
* Web Dev
   * 1-page redesign
   * Free Wireframe
   * Free Landing Page
   * Broken feature repair
   * Free website mockup
   * Free speed optimization (3 bottlenecks removed)
* Lead Generation
   * 1,000 Free Leads
   * Free email script
   * Book a call for them
   * if we book you 10-20 prospects
   * Free Database reactivation - retargeting email campaigns to existing leads, or previous calls who havent closed. (direct roi)
* Content/Video
   * Free video
   * 2 short-form videos edited from your existing raw footage
   * Podcast → content conversion of one episode
   * Free UGC Content
   * We’ll turn your last CONTENT video into a full campaign
   * Free video hook testing: 3 hooks we’ll script + edit for you
* AI
   * Free AI Build
   * Free Demo of AI
   * 1 free AI automation flow (lead routing, email replies, etc.)
   * Free chatbot trained on your site
   * Free automation setup
* Amazon Marketing
   * Free Amazon listing rewrite
   * 1 PPC campaign build
   * Free competitor keyword tear-down
   * Free Listing Optimization
   * We will build you a new ad campaign if it outperforms your current one you pay us $2500
   * We will increase your sales by X and you only pay if we do
   * Free ASIN listing rewrite with backend keyword update
* Software Development
   * Free MVP scope doc
* Influencer Marketing
   * List of influencers
   * * Print & Direct Mail
   * 1 free mailer design
   * Free printed sample pack
   * 1 free postcard mockup
* Branding, Creative, PR
   * Press pitch template
```

### 4.13 "Offer Introduction" guarantee statements by niche (L3358-3462)

- **Label: BAD as written.** Archive "Too Hype / Risky: extreme guarantees, oversized revenue claims, blanket vertical promises without proof", and the prompt says "Avoid buzzwords, overpromises". Use only as inspiration for the *shape* of a risk reversal, and only with the client's approved guarantee. "Manufacturing" is cut off in the source.

```text
Offer Introduction
Here are a few offer statements we’ve run across several different niches.
E-commerce Niche
* We’ll make you 10 ad creatives in the next week and if they don’t beat your current ones by 50% we’ll give you $1000 for wasting your time.
* We partner up with CPG brands to increase their sales on Amazon by at least 60% in 30 days without charging retainers.
* We increase brand sales by at least 60% next month using optimized Amazon creative listings without shelling out hefty retainers or doing paid ads.
* We’ll run a 30-day TikTok Shop campaign for free, and if we don’t increase sales by 100% in that time, I'll personally send a $500 gift card from Nobu to you.
* We’ll beat your Klaviyo welcome flow by talking to you for 30 minutes, if you don’t, I’ll buy your next company dinner.
* I’ll give you an audit of your meta ads and find 3 ways to decrease CPA by 50% in the next 5 days. If I can’t find 3 ways to help you, invoice me your hourly rate and consider it paid.
* We’ll build you a brand new landing page, and if we can help you beat your current conversion rate by over 120%, you pay us $4k, no setup costs or anything up front.
* We’ll Increase ROAS by 30% in 35 days on a complete commission basis.
* We increase CPG brands sales by 350% in 90 days on a 100% performance basis.
* I’ll build you a brand new advertising campaign, and if it brings you 100 new customers in 60 days, I have permission to invoice you $3500 without retainers or upfront fees.
SaaS (Software as a Service)
1. We’ll optimize your user onboarding process, and if we don’t reduce your churn rate by 40% in 60 days, we’ll give you $2000 for your time.
2. We’ll increase your trial-to-paid conversion rate by 50% in 30 days, once we do, agree to pay us $2000, no upfront costs or running retainers.
3. We’ll double your MRR in the next 3 months using targeted email campaigns, or you don’t pay a dime.
4. We’ll reduce your customer acquisition cost by 30% within 45 days, or we’ll reimburse your marketing spend.
5. We’ll generate 100 qualified leads for your SaaS in 60 days, or we’ll pay your team $3000.
```

> [The other niches follow the same "We'll [result] in [N days], or we'll [pay you $X / refund / cover your rent]" pattern, 5 statements each: Real Estate L3377-3382, Health & Fitness L3383-3388, Financial Services L3389-3394, Hospitality L3395-3400, Education L3401-3406, Legal Services L3407-3412, Medical Services L3413-3418, Travel L3419-3424, Real Estate Investment L3425-3430, Automotive L3431-3436, IT Services L3437-3442, Home Improvement L3443-3448, Marketing Agencies L3449-3454, Non-Profit L3455-3460, Manufacturing L3461-3462 (cut off after 1 line). Same label: BAD as written (Archive "Too Hype / Risky").]

### 4.14 Script Templates (L3463-3508). Frameworks (GOOD), also covered in 2.12

```text
Script Templates:
You have black and white text. You have 1 email to convince someone to book a meeting with you depending on your offer and niche. By solving this problem you can instantly become a value add asset to grow any business by having a full understanding of a companies pain and giving them a taste of winning.
Leverage a part of your service that already works to generate a lead magnet. A lead magnet provides a complete solution to a very narrow problem.
Solving that problem creates a new problem which is solved by our offer.
Always confirm each script is below 3rd grade reading level. Run this into Chatgpt and say make this script as short and simple as possible without losing its core value.
If you contact someone multiple times then you show that you are serious. Curiosity increases because they fear they’re missing out.
5-6 touchpoints on linkedin, sms, call, email.
https://hemingwayapp.com/
```

> [L3471-L3508 repeat Base 1, Base 2, the Ultimate Cold Email Sequence (Steps 1-3) and the personalisation list. These are already quoted in 1.12, 2.12 and 4.10.0. The only new wording there is Step 2's "{Another variation of Email 1's first AI-generated line} / {Another form of social proof} / {Softer CTA (not direct to call - but ask if they would like to explore this further)}", quoted in 1.12.]

### 4.15 99 Archive Recommendations (L3511-3515). The SOP's own BAD list

```text
99 - Archive Recommendations
• Too Generic: 'If we could help generate 1-5 clients…', broad 'We help X get Y in Z time', stand-alone 'Interested?' and 'Worth a chat?'
• Too Hype / Risky: extreme guarantees, oversized revenue claims, blanket vertical promises without proof
• Duplicate Concepts: repeated 'mind if I send a video?', repeated 'not sure if this is for you', repeated 'we helped case study', repeated 'can I send a doc?'
• Needs Rewrite: anything that feels botty, vague, or built around unbelievable guarantees instead of a grounded observation or proof point
```

### 4.16 HeyReach LinkedIn scripts (L3853-3908). Not email. LinkedIn needs system fixes (CLAUDE.md), so use only if Alex restarts LinkedIn

```text
Loom tutorial: HeyReach - 22 April 2026
1.
A-MAIN
Hey {FIRST_NAME},
Do you remember our conversation about X over email?
FB
Do you remember our conversation about X over email?
B-2ndary
Hey {FIRST_NAME}, just connected here too, wanted to keep the conversation going from email.
Still keen to grab that virtual coffee?
FB
Just connected here too, wanted to keep the conversation going from email.
Still keen to grab that virtual coffee?
2.
mind if I send over a video showing how it works?
3.
heres the ASSET I posted recently:
LINK:
im not asking for anything in return, just let me know if its useful. the feedback would be appreciated!
```

### 4.17 Enterprise prompt examples (personalisation, soft CTAs, front-end offer starters) (L3786-3852). GOOD

- Inside the prompt (6.6). The example "Teams like {{peer_company}} cut reply time 37%" is a placeholder number.

### 4.18 Lead FLO Marketing record (L4813-5459). **CLIENT-SPECIFIC (Dulcy client). Never reuse for another client.** Not copied here; credentials inside, see header. Its copy-relevant content lives in `clients/lead-flo-marketing.md`. Two parts teach a general method:

- Alex's request for vertical benchmarks "for positioning only" (L5376-5412, quoted in 1.15).
- The thesis wording (L5459, verbatim below). Example of an offer-validation thesis; it conflicts with Rule 3 (section 7).

```text
As mentioned, this is one of your high-performance niches, and we want to target it hard. We bulked up this campaign for an offer validation angle test, we want to get an idea of how the market reacts to your offer. We will be running 9 offer validation tests, 3 lead magnets, 3 guarantees/ppl, 3 short resource magnets. This is a good first step into understanding which offer performs best so we can take that winning offer and leverage 3 more variants in the follow-up campaign to this one.
```

---

## 5. How to pick and test angles, and when to rewrite vs keep

### 5.1 Picking the angle
- Spend the time on three things only: "choosing the right pain / choosing the right proof / choosing the right contacts" (L679-686).
- Pick **one** dream outcome type (money/time/status) that fits this audience. Status is "extremely underrated" (L757).
- Pick the structure by awareness: unaware → Question → Proof → CTA. The outcome is already wanted → Offer → Proof → CTA (L68-73).
- New category → lead with third-party authority to validate the category (L931).
- No own proof yet → third-party authority or knowledge-as-proof (L809, L817-829).
- Commodity offer → "Find the one thing that is actually different ... and anchor your entire cold email copy to that." (L3264-3267). Method: click every page of the client's site and find the one feature that is actually different (L3223-3240).
- Weak product → "lean into the lowest-friction entry point. Free and specific will always outperform vague and paid." (L3084-3087).
- Use the buyer's words. Reddit "3 layers of pain": "Most GTM copy lives at Layer 1. The best copy mirrors Layer 3." (L1533-1541). Workflow at L1545-1550. From calls: "figure out the top 3 pain points ... top 3 reasons why someone converts ... the top 3 reasons why someone doesn't convert ... then build lead magnets off of that data" (L1569-1574). Competitors: "figure out which lead magnet(s) they're using ... figure out the weak points" (L1580-1583).
- One angle per buying situation (L1667-1676). Pre-handle recurring objections (L1677-1681).
- Reframe with a new label ("secondhand leads", L1185-1209).

### 5.2 Testing
- SOP: "Write a maximum of 3-5 versions ... Then choose one winner." (L85-95). "Do not test five ideas in one campaign." (L516). Library: "Test multiple angles in Email 1 and scale winners." (L2332).
- **RULES WINS:** one thesis per campaign, **2 angles of Email 1**, each testing a real difference (USP, pain point, solution angle). Never trivial word swaps.
- "Write down who you're testing, what you're saying, and why you think it will matter to them. When the replies come in, keep them with that experiment so you can use them for the next one." (L1688).
- "Let the data pick the winner. ... Now we know the vertical and will scale from there." (L3128-3137).
- Reddit language bank: "Test against existing copy and watch response rate move" (L1550).

### 5.3 Rewrite vs keep
- Keep: "Do not keep rewording a script that already works." (Rule 4, L520). "If it passes, stop editing." (L211). "Do not keep rewriting forever." (L98).
- Rewrite: fails the final send check → "rewrite once. Once." (L478-481). Fails the offer test → "Fix the offer. Then send" (L1376-1377). Archive "Needs Rewrite: anything that feels botty, vague, or built around unbelievable guarantees" (L3515). Scammer test fails → "add specificity" (L999).
- "Changing the copy doesn't fix a sending problem" (L1687). Check deliverability first (RULES bounce/spam method).

### 5.4 Top off / new vertical / new offer (SOP table, L1586-1645), verbatim (framework version)

```text
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
```

- **RULES WINS on the metric:** top-up = bounce under 4%, reply rate 2%+, interested 15%+ of replies. "Interested rate is the main driver." (RULES 2026-11-18). Trigger at ~60% completion (RULES 2026-11-17 / 2026-11-25). Atlas decides; Scribe writes.

### 5.5 "Each campaign should improve the next one" (L1649-1688): steps
1) Pull interested leads and objections, with the message each received + call transcripts + rep notes. 2) Research the interested companies (sites, Wayback Machine) for unplanned patterns (e.g. "80% of your booked calls came from companies without sales leadership"). 3) One angle per buying situation, using internal info, industry changes and their own language (Reddit, Trustpilot). 4) Answer recurring objections earlier. 5) Lookalikes of interested leads get the message that earned interest. New segments get their own message. Remaining eligible leads get a new angle. Respect opt-outs. Check delivery health. The prompt for this is 6.7.

### 5.6 Monthly rinse and repeat (L1295-1310)
- "Every month: Pull new list / Change angle / Refresh copy / Run again", with month-by-month angles (verbatim in 4.5).

---

## 6. Prompts and AI instructions (verbatim)

### 6.1 Dulcy copywriter prompt (L1840-2214)
Sections in order: role, guide, Triple Tap, Rules, Input Data, Thesis. The second copy at L5462-6462 is identical except the Input Data is filled with the Lead FLO record (client-specific, has credentials, not copied).

```text
You are an expert outbound email copywriter. You work for Dulcy, a b2b growth partner agency that creates personalized automated cold email campaigns for other b2b businesses. You are helping me write a cold email campaign for my clients.
Your task is to generate short, punchy, and effective cold email scripts using the SOPs and "Triple Tap" framework that we will be sending on the clients behalf. These emails are to bespoke and thought outside the box to generate positive interest and get them into a meeting with our client in a fashion that is unique to the client.
---
```

> [Lines L1849-L2139 paste the whole guide "HOW TO WRITE HIGH-CONVERTING COLD EMAIL COPY IN 2026" here. It is word for word the same as L715-L1005. The guide's rules are quoted in sections 1-3 and its examples are in 4.2, so it is not repeated here. The prompt then continues:]

```text
### Triple Tap Framework:
1. **First Tap (Open)**: Write a subject line that sparks curiosity, sounds like a vendor or client email, and never feels salesy.
2. **Second Tap (Read)**: Write the body (max 3–4 sentences). Identify a problem, show credibility (clients/results), and offer a simple solution. Use a 6th-grade reading level.
3. **Third Tap (Reply)**: End with a low-friction CTA answerable in one word. No links. No “book a call.” No friction.
---
### Rules:
- Max total words per email: 75.
- Minimum total words per email: 30.
- Always personalize with recipient's first name if available.
- Use these variables:
  - `{FIRST_NAME}` for the prospect’s first name
  - `{COMPANY}` for the company name
- Use a natural, conversational tone that matches the target market.
- Avoid buzzwords, overpromises, or bait-and-switch.
- Include credibility (case studies, clients, proof).
- Do not insert real names or companies. Use variables only.
- Never mention the "Triple Tap" formula or any fomrula.
- Do NOT ask for review or approval. Just create the emails.
- Do NOT use euphoric words.
- NEVER use phrases like “this isn’t just” or “it’s not just”.
- Use only **short dash with spaces** like this: ` - ` (not long dashes).
- Avoid semicolons or excessive punctuation.
- Map data provided by the user naturally, **only if relevant**.
- Ignore irrelevant fields.
- Never say “I am following up” or terms similar.
- Cut out any words that don’t provide value to the email.
—
### Input Data (structured):
Onboarding Form
https://airtable.com/appxqINt5XKw7a76A/tbljhM1JmUwr99tu4/viwye2IZBUqAhNTIN?blocks=hide
Previous Campaign Results
https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/viwekKOXhxuLivgE7?blocks=hide
Client Offer Sheet
https://docs.google.com/document/u/0/?pli=1
Client Case Studies (if available)
https://airtable.com/appxqINt5XKw7a76A/pag8vZwmRjcovnqYm?aMB6P=recFlJnsrKJ6HSbnk
---
This is what the campaign is about. This is the campaign thesis:
{THESIS}https://airtable.com/appxqINt5XKw7a76A/pagUNZ2TYAjFdLsdY?kCEe3=recnqphyqF1u3Xlvt
```

### 6.2 Spintax prompt (L3516-3524)

```text
I'd like to introduce you to the concept of "spintax" (also known as spin syntax), which is a method used to generate unique variations of a text by using placeholders and alternative words or phrases. This is especially useful when creating multiple instances of similar content while still keeping it unique and engaging.
Spintax uses curly brackets { } to enclose different options for a word or phrase and the pipe symbol | to separate each option. When the text is processed, one option is randomly selected from each set of brackets, creating a unique combination each time.
Here's an example of a spintax-formatted sentence:
"{Hello|Hi|Greetings}, {GPT|AI|Language Model}! {How are you|What's up|How's it going} today?"
When processed, it can produce various outputs like:
Hello GPT! How are you today? Hi AI! What's up today? Greetings Language Model! How's it going today? I hope this helps you understand spintax better.
Remember that each choice or words or phrase must be compatible with every other choice so all phrases must be able to be combined randomly not just 1,1,1 2,2,2 but 1,3,2 and 1,2,1 etc. Ensure that all variations make grammatical sense. Do not spintax any word that contains a {} (ex. {FIRST_NAME} or {COMPANY}). Keep spintax variants on a conversational level.
Use no more than 4 examples of spintax in each sentence and update the following text to use spintax:
{EMAIL COPY}
```

### 6.3 "/DEEP": 10 lookalike domains (L3529-3557). Scout

```text
/DEEP
Attached below is my client’s onboarding form and company information.
You are an expert b2b sales/business development researcher attempting to find 10 companies that are best fits for the company. This role is very important because our job is on the line for coming up with good fit companies for new business. You will have below information about what we do. It is important to keep in mind the offer and the type of companies they are reaching out to. The method of outreach is via cold email. Please give me 10 domains that would best work in a relationship of the company sending a cold email to these 10 companies. Simple rule to follow is these companies must be:
1. Growing Industry
2. Easy to Find
3. Can Afford the Service
4. Has the need for the service
INPUT INFORMATION:
This is our clients Cold Email (Outreach) Offer:
{OFFER}https://docs.google.com/document/u/0/?pli=1
This is our clients Onboarding Form:
{FORM}https://airtable.com/appxqINt5XKw7a76A/tbljhM1JmUwr99tu4/viwye2IZBUqAhNTIN?blocks=hide
Additional Information:
{EMPTY}https://airtable.com/appxqINt5XKw7a76A/pag8vZwmRjcovnqYm?aMB6P=recFlJnsrKJ6HSbnk
```

### 6.4 DiscoLike ICP description prompt + examples (L3558-3628). Scout

```text
You are a professional analyzer for b2b sales and business development. Your goal is to describe an ICP (ideal customer profile) for our client to populate query fields in https://app.discolike.com/
You will be given information about the client and the campaign thesis that is being created. THe campaign thesis information is what our company has decided to target and campaign goal ideas with this campaign. When you describe this ICP you should focus on describing the type of company that our client can help.
INPUT INFORMATION:
This is what the campaign is about. This is the campaign thesis:
{THESIS}https://airtable.com/appxqINt5XKw7a76A/pagUNZ2TYAjFdLsdY?kCEe3=recnqphyqF1u3Xlvt
This is our clients Cold Email (Outreach) Offer:
{OFFER}https://docs.google.com/document/u/0/?pli=1
This is our clients Onboarding Form:
{FORM}https://airtable.com/appxqINt5XKw7a76A/tbljhM1JmUwr99tu4/viwye2IZBUqAhNTIN?blocks=hide
Additional Information:
{EMPTY}https://airtable.com/appxqINt5XKw7a76A/pag8vZwmRjcovnqYm?aMB6P=recFlJnsrKJ6HSbnk
Examples:
“U.S.-based veterinary emergency, specialty, or imaging-focused clinics”
“Small Warehouse Space for Rent in United States”
“Online women’s apparel retailer in United States”
“Industrial automation and control products worldwide”
“Full-service moving companies offering residential and commercial relocations in United States”
“Outpatient pediatric clinics in United States”
“General dental practices offering comprehensive family & cosmetic dentistry in California, United States”
“Staffing and recruitment agencies in United States”
“Full-service upscale hotel offerings in Nova Scotia, Prince Edward Island, New Brunswick & Newfoundland, Ca…”
“Companies using magento.com Worldwide”
“Casual and fast-casual restaurant groups in New York, United States”
“Integrated cloud-based video surveillance & access control companies EU, United Kingdom, United States”
“Casual fast-casual restaurant groups in New York, United States”
“Coffee shops and cafes with walk in locations in United States”
“Full-service hotel investment & management companies United States and Canada”
“In-home care and home healthcare providers in United States”
"Full-service moving companies offering residential and commercial relocations in United States"
"Outpatient pediatric clinics in United States"
"General dental practices offering comprehensive family & cosmetic dentistry in California, United States"
"Staffing and recruitment agencies in United States"
"Full-service upscale hotel offerings in Nova Scotia, Prince Edward Island, New Brunswick & Newfoundland, Ca"
"Companies using magento.com Worldwide"
 "Casual and fast-casual restaurant groups in New York, United States"
 "Integrated cloud-based video surveillance & access control companies EU, United Kingdom, United States"
 "Casual fast-casual restaurant groups in New York, United States"
"Coffee shops and cafes with walk in locations in United States"
 "Full-service hotel investment & management companies United States and Canada"
 "In-home care and home healthcare providers in United States"
"Mobile game development studios focused on casual/hyper-casual titles"
 "Remote security monitoring and alarm receiving service providers in United States & United Kingdom"
 "In-ground fiberglass pool construction & installation in Australia"
"Third-party claims administration companies using major CRM providers in United States"
 "Guided big-game hunting outfitter services in United States"
"Remote security monitoring & alarm monitoring providers in United States & United Kingdom" "Companies with ChatBox on their home page from smaller chat vendors, excluding Zoho and Zendesk in Unit."
 "Companies with Zendesk chatbox in United States, with 25-200 employees, 100 demo records"
```

### 6.5 Lead list usability prompt (L3631-3691). Scout

```text
You are a professional analyzer for b2b sales and business development. Your goal is to identify the usability of a lead list that is going to be used for Outbound Cold Email Campaigns. These leads are paid for and are about to go before the verification process. Your job is to look through the CSV file and determine if these lists of leads are usable for a cold email campaign. These leads have never heard of our client before or what we offer. It’s important to understand we want to aim for 8-9/10 of the leads to be a good contact for our client. I am going to attach the file which contains information about the lead. In the prompt below there is information based on our client and type of campaign being run. You must output 3 scores for the following categories:
Create 3 buckets:
### Tier 1
Clear decision-makers
### Tier 2
Borderline but acceptable
### Cut
Low-value contacts
Do not try to make the list perfect. Just separate:
- clearly good
- maybe usable
- clearly bad
### USEABILITY SCORE
Better target
            * 90%+ = very clean
            * 85%+ = strong
            * below 75% = probably too noisy
Practical breakdown
A good sendable list often looks like:
            * 40–50% usable
            * 30–40% borderline
            * 10–20% unusable
Determine if the list is about the better target bench mark:
            * 90%+ = very clean
            * 85%+ = strong
            * below 75% = probably too noisy
INPUT INFORMATION:
This is what the campaign is about. This is the campaign thesis:
{THESIS}https://airtable.com/appxqINt5XKw7a76A/pagUNZ2TYAjFdLsdY?kCEe3=recnqphyqF1u3Xlvt
This is our clients Cold Email (Outreach) Offer:
{OFFER}https://docs.google.com/document/u/0/?pli=1
This is our clients Onboarding Form:
{FORM}https://airtable.com/appxqINt5XKw7a76A/tbljhM1JmUwr99tu4/viwye2IZBUqAhNTIN?blocks=hide
Additional Information:
{EMPTY}https://airtable.com/appxqINt5XKw7a76A/pag8vZwmRjcovnqYm?aMB6P=recFlJnsrKJ6HSbnk
```

### 6.6 Enterprise cold email prompt, "Here's the prompt we use" (L3692-3852)

```text
Here’s the prompt we use:
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
CTAs remain soft: e.g., “Would it make sense to...”, “Open to exploring...”, “Worth a peek?”
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

### 6.7 Next-campaign experiment prompt (newsletter, L1689-1693)

```text
If you want to hand this process to ChatGPT or Claude Code, paste this whole email in and add the prompt below.
Use this newsletter to help me design my next campaign experiment. First, identify my sequencer and the available way to read its campaigns and replies, such as an API, CLI, MCP or export. Ask me for missing access. Gather my offer, internal campaign information and sales-call transcripts, then ask what I learned from the conversations that the transcripts missed.
Separate interested replies, objection replies and unanswered outreach. Research the interested companies through their websites and, where useful and available, historical Wayback Machine pages. Compare patterns with the rest of the audience. Suggest similar companies to find and new signals or segments to test, without treating engagement as proof of a sale.
Look for relevant industry changes and direct pain-point language from Reddit or review sites such as Trustpilot. Use those inputs to propose a specific message for each segment based on how my offer helps them. Identify recurring objections we can honestly address earlier in the sequence. Propose a new angle for eligible remaining leads, excluding unsubscribed or suppressed contacts.
Show the evidence behind each experiment, what is still an assumption, and what response would help us decide the next step. Ask for my approval before changing campaigns, adding contacts or sending anything.
```

### 6.8 Smaller AI instructions in the doc
- Step 1 inputs: "Open Claude, input: ... Prompt: X - # 2-Hour Cold Email Campaign SOP" (L101-111). The prompt link points back to this doc (= 6.1).
- "GPT PROMPT (5 domains)" (L256) = 6.3. "GPT PROMPT (ICP)" (L261, "use this more likely then not") = 6.4. "Paste in GPT w/ CSV" (L278) and the list score "Prompt" (L345) = 6.5.
- "Make sure to use ICP Prompt, it will outperform manually selected lookalike domains, text, and keywords 80% of the time." (L254).
- "Second one is do run validation prompt ... Click on DiscoGen and click on the wizard icon next to the prompt, test on the 100 or so records first in one go." (L291-300).
- "Always confirm each script is below 3rd grade reading level. Run this into Chatgpt and say make this script as short and simple as possible without losing its core value." (L3467).
- Reddit workflow: "Feed output into Claude - extract recurring phrases, emotional language, specific failures, and the fear underneath each complaint / Build a language bank - real phrases you drop into subject lines, openers, and CTAs" (L1548-1549). Tool: "https://github.com/ykdojo/claude-code-tips/blob/main/skills/reddit-fetch/SKILL.md" (L1525).
- Calls: "Take all of your sales calls + current client calls / plug into Claude to analyze transcripts/notes" (L1569-1570).
- DiscoGen personalisation: "DiscoGen visited each prospect's website and pulled the exact keywords they'd bid on in Google Ads." (L3106).
- Library: "{AI generated first line that is very relevant to the prospect reading this email + also noting what you did for the competitor company}" (L2843), "{AI generated line about how this company could use it based on what the company does and the prospect's role}", "P.S. {AI generated analogy}" (L2713-2715), "{AI SUMMARY OF REVIEW}" (L2392).

---

## 7. Conflicts

Format: **SOP says** vs **RULES.md (or the SOP elsewhere) says** → what to do. RULES wins over the SOP. A conflict inside the SOP, or one RULES does not settle, is UNKNOWN: ask Alex once, then log the answer.

| # | Topic | Side A (quote, line) | Side B (quote, line) | Resolution |
|---|---|---|---|---|
| C1 | Proof count | SOP: "Are there at least 2 proof elements?" (L196); "Aim to include two proof elements per email." (L833) | RULES 2026-11-25: "at least 1 strong proof per email. More is better, as long as every extra proof is just as strong (no filler proof)." | RULES wins |
| C2 | Proof count, inside SOP | "Rule: ... one proof" (L90); "Proof: one client, one source, or one specific insight" (L26); "Ship: ... one proof" (L493) | "at least 2 proof elements" (L196, L987) | Settled by RULES (C1) |
| C3 | Proof vs offer-first | Transcript: "You can lead with offer and just do a CTA. This is my preference because I think most proof ... isn't doing a great job in the early stages" (L1646) | RULES: at least 1 strong proof per email | RULES wins (proof can be baked into the offer, L861) |
| C4 | Number of variants | SOP: "Write a maximum of 3-5 versions ... Then choose one winner." (L85-95) | RULES 2026-11-25: "one direction per campaign (one thesis), with **2 angles** of Email 1" | RULES wins |
| C5 | Testing volume, inside SOP | Rule 3: "Do not test five ideas in one campaign." (L516) | Library: "Test multiple angles in Email 1 and scale winners." (L2332); enterprise prompt "produce 6 variations" (L3760); Lead FLO thesis: "We will be running 9 offer validation tests, 3 lead magnets, 3 guarantees/ppl, 3 short resource magnets." (L5459) | RULES (2 angles) wins for new work; the 9-test thesis is history |
| C6 | Spintax | SOP: "### SPINTAX IT" step + spintax prompt (L164-167, L3516-3524); subject lines in spintext (L3754) | RULES 2026-11-17: "Copy: no spintax in client-facing text, no manual signature." vs RULES 2026-11-24: agent builds "copy, spintax, build" | UNKNOWN which reading is right. Likely: spintax added at build, client sees clean copy. Ask Alex |
| C7 | Signature | SOP signature block with spun closer, name, role, company, website, phone, address (L170-179) | RULES 2026-11-17: "no manual signature" | RULES wins: do not type a signature into the copy unless Alex says the SOP block is the approved one. UNKNOWN where the signature comes from (EmailBison sender signature?) |
| C8 | Word count | SOP core: "30–75 words" (L92, L203, L960, L2154-2155) | "Address all 5 in under 50 words" (L1131); "< 70 words (target 30 / 45 / 60 word bands)" (L3721); "25–69 words per script (strict)." (L3824); transcript "between 30 and 70" (L1646) | RULES silent. Use 30-75 (the 2-hour SOP and Dulcy's own prompt); ask Alex if he wants <70 |
| C9 | Reading level | Triple Tap: "Use a 6th-grade reading level." (L1012) | "Keep scripts below a 3rd-grade reading level when possible." (L2329, L3467); "Can a 10-year-old understand" (L1087) | UNKNOWN. Aim as low as clarity allows; ask Alex |
| C10 | Call asks | Triple Tap: "No "book a call."" (L1013); enterprise "never a hard call ask" (L3776) | SOP examples and CTA bank: "Do you have 12 minutes this week for a call?" (L2279), "Mind if I send over some times for a quick call?" (L2271), "do you have 15 minutes this/next week" (L1056), "Got 15 minutes to learn more this week?" (L2368) | RULES 2026-11-25 settles it: no call ask in the cold sequence unless it is the only logical next step |
| C11 | "Worth a chat?" | Archive: "stand-alone 'Interested?' and 'Worth a chat?'" are too generic (L3512) | The library uses "Worth a chat?" as the CTA in several templates (L2342, L2435, L2579, L2678); the 2-hour SOP's own CTA type list includes "Is this worth a quick chat?" (L879) | Internal SOP conflict; follow the Archive (avoid stand-alone versions) |
| C12 | Real names in copy | Prompt: "Do not insert real names or companies. Use variables only." (L2163) | SOP proof needs named proof: "Proof: work with brands like Planta / Fire Pit Outfitter" (L33); "Named a specific, well-known game company" (L948); "same-world proof" (L660) | Use real names only for the client's approved proof (non-negotiable 3); everything prospect-side is a variable |
| C13 | Subject format | "Always 1–3 words ... No punctuation." (L3753-3756) | Library subjects with punctuation or longer: "{FIRST_NAME}?", "re:[your service]", "{RESTAURANT}'s food - yes or no?" (L2256-2268); "Stole your competitor's customer list (kind of)" (L819); "helping {{area}} companies with AI" (L2575); "1 million TikTok views for COMPANY" (L2801) | UNKNOWN which wins; the newer prompt rule (1-3 words, no punctuation) is the stricter. Also "re:" fakes a reply thread: ask Alex before using |
| C14 | Dashes | "Use only **short dash with spaces** like this: ` - ` (not long dashes)." (L2168) | The SOP's own example lines use "—" (e.g. L1026, L1044, L1050) | Follow the rule; rewrite examples |
| C15 | Semicolons | "Avoid semicolons or excessive punctuation." (L2169) | "ps if this isn't relevant, just say stop; thanks!" (L2707) | Follow the rule |
| C16 | Follow-up phrasing | "Never say "I am following up" or terms similar." (L2172) | Library follow-up: "As I mentioned in my first email, one of our clients ..." (L2799) | Follow the rule (template labelled BAD) |
| C17 | Links | Triple Tap: "No links." (L1013) | "Free Doc Link ... Have fun - Link" (L2442-2444); LinkedIn "heres the ASSET I posted recently: LINK:" (L3902-3905) | No links in email (RULES also keeps the unsubscribe link off) |
| C18 | Step 3's job | 2-hour SOP: "Step 3 job / Add trust, proof, examples, or practical ideas." (L139-140) | Ultimate sequence: "Email 3 = right-person check." (L2299, L3491-3494) | Internal conflict. Follow the 2-hour SOP; ask Alex if a right-person email is wanted as Step 3 or 4 |
| C19 | Guarantees and big claims | "Offer Introduction" list: e.g. "We'll double your MRR in the next 3 months ... or you don't pay a dime." (L3374), "or we'll pay your office rent for a month" (L3382) | Archive: "Too Hype / Risky: extreme guarantees, oversized revenue claims" (L3513); prompt: "Avoid buzzwords, overpromises" (L2161); CLAUDE.md non-negotiable 3: "Never invent client proof, results, prices or promises." | RULES wins: only the client's approved guarantee |
| C20 | Headline proof | Guide: "The Bare-Bones Framework That's Generated $220,000+ in Revenue" (L717); "After running over 1,326 cold email campaigns" (L1650) | RULES 2026-11-17: "Do not state client counts, results or proof that are not verified for Dulcy." (the "300+ clients" figure came from another agency's post) | Never use these as Dulcy claims |
| C21 | Approval before launch | SOP launch flow: "Click Create Campaign ... Add Email Accounts / Launch ... Text Client Campaign Launched." (L554-612); prompt: "Do NOT ask for review or approval. Just create the emails." (L2165) | RULES 2026-11-25: two Alex approvals (plan; final copy and list), "Then the client approves the copy, and only then does it launch." | RULES wins; Scribe drafts are review-only |
| C22 | Next-campaign metric | SOP: "Client's email-to-lead ratio is close to or better than your overall agency average" / "Underperforming by 40%+" (L1634-1645) | RULES 2026-11-18: "Top-up rule: targets are bounce under 4%, reply rate 2%+, interested 15%+ of replies. Interested rate is the main driver." | RULES wins |
| C23 | One ICP vs go wide | SOP: "Ship: - one ICP" (L491); "Do not write copy while the ICP is still fuzzy." (L508) | Nick Abraham thread: "2. Go wide on market. I didn't want to bet on one industry. ... I pulled a wide spread of B2B service companies and let the data tell me what converts." (L3092-3098) | Internal conflict. RULES "one direction per campaign (one thesis)" favours one ICP |
| C24 | Channels / touchpoints | "Use 5–6 touchpoints across LinkedIn, SMS, call, and email." (L2331, L3469); HeyReach launch steps (L575-612) | CLAUDE.md: "Right now only cold email works. LinkedIn and direct mail need system fixes." | Email only for now |
| C25 | Daily send caps | "Max_emails_per_day: 2500-10000 / Max_new_leads_per_day: 2500-10000" (L550-551) | RULES 2026-11-23: "max emails per day = inboxes x daily limit, max new leads per day = 80% of that" | RULES wins (not Scribe's job, listed for completeness) |
| C26 | List scaling and fit | "Start 100, 1000, 4000, 10000." (L303); usability "90%+ = very clean / 85%+ = strong" (L337-338); "aim for 8-9/10 of the leads to be a good contact" (L3631) | RULES 2026-11-23: default 3,000 final leads per campaign; "the 80% sample fit target is a warning, never a lock"; 2026-11-18: "no obvious bad fits, not a perfect ideal fit" | RULES wins (Scout/Atlas) |
| C27 | Credentials in the source | SOP export contains Lead FLO's LinkedIn password, 2FA secret and ci_password (L5029-5048, L5148-5149, again L6019-6139) and webhook URLs (L4790-4806) | RULES 2026-11-17: "Never include keys, tokens, passwords, cookies or client prospect rows in this repo." | Not copied here. Alex/Riley to redact the export and rotate the credentials |
| C28 | Variable syntax | Prompt: `{FIRST_NAME}`, `{COMPANY}` (L2158-2159) | Enterprise prompt: Clay `{{first_name}}`, `{{company_name}}` (L3820); library mixes `{{firstName}}`, `FNAME`, `&signature%` | UNKNOWN which syntax EmailBison/the engine uses. Use the one the engine's QA checks |

**Conflicts count: 28** (C1-C28), in two groups:
- **SOP vs RULES.md / CLAUDE.md (14):** C1, C3, C4, C6 (RULES is also unclear here), C7, C10, C19, C20, C21, C22, C24, C25, C26, C27.
- **Inside the SOP (14):** C2, C5, C8, C9, C11, C12, C13, C14, C15, C16, C17, C18, C23, C28. RULES settles C2, C5, C12, C17 and C23. The other 9 stay UNKNOWN until Alex decides: C8 word cap, C9 reading level, C11, C13 subject format, C14, C15, C16, C18 Step 3 job, C28 variable syntax.

---

## 8. What the old summary (`sops/campaign-sop-summary.md`) missed or got wrong

**Missed entirely:**
1. The **Triple Tap Framework** by name, and that it is the framework in Dulcy's own copy prompt (L1010-1013, L1840-1842).
2. Most of the prompt's **Rules** list: "Avoid buzzwords, overpromises, or bait-and-switch", "Do NOT use euphoric words", "Never mention the 'Triple Tap' formula or any formula", "Do not insert real names or companies. Use variables only", "Map data ... only if relevant / Ignore irrelevant fields", "Cut out any words that don't provide value", "Always personalize with recipient's first name if available" (L2156-2173).
3. **Curiosity + Trust** as the two jobs of every email, and Dream Outcome = curiosity, Perceived Likelihood = trust (L731-741).
4. How to present the dream outcome: who it's for first, anchor to their situation, most believable for where they are; same offer → different audiences; "Status is extremely underrated"; plain language over stats (L757-776).
5. The **three proof types** in detail: social proof with layered similarity, third-party authority that must match the reader's worldview, knowledge-as-proof / "stealth offer" (L779-829, L1155-1179).
6. **CTA types** (interest / resource / permissionless), "signal" on top of a structure, and the non-decision CTA ("Want me to set it up? Takes 30 seconds and it's free.") (L872-884, L3117-3123).
7. The **CTA bank tiers** (Hard / Soft / Softest), Top-16 CTA list, **P.S. bank**, subject line **types** and examples (L2249-2295).
8. The **signature block** with spun closers and the "tell me to pound sand" P.S. opt-out (L170-179). That P.S. is what RULES relies on for opt-outs.
9. The **99 Archive Recommendations** (the SOP's own bad-copy list) beyond "Interested?/Worth a chat?": the whole Too Hype / Duplicate / Botty list (L3511-3515).
10. The **enterprise prompt** in full: 30/45/60 bands, Simple/Niche-aware/Hyper-specific tiers, structural elements with word sizes, Clay variables, "No emojis", "25–69 words (strict)", front-end offer = "format + outcome + time requirement", personalisation ideas only with an example, reasoning summary (L3692-3852).
11. Spintax prompt details: "Keep spintax variants on a conversational level", every combination must work (1,3,2 / 1,2,1), "Do not spintax any word that contains a {}" (L3522-3523).
12. Offer theory: "98% ... concept of the thing you're selling", "0 personalization + 10/10 offer", the 5 offer questions, front-end / back-end / cold-traffic definitions, "That's not an offer. That's a company bio.", "Find the one thing that is actually different", "Free and specific will always outperform vague and paid", the "free without desperation" lines (L1093-1134, L1369-1390, L1452-1506, L3084-3087, L3264-3267).
13. Copy-craft techniques: the "secondhand leads" reframe / old way vs new way; "Why you why now"; model-example pattern; read it out loud ("like you're talking to someone at a bar") and check it with the rep who took the calls; "Two tests for copy" (10-year-old, say it in person); "Personality and humor differentiate".
14. Research methods for language: Reddit 3 layers of pain + 5-step workflow; call transcripts → top-3 pains/converts/non-converts → lead magnets; competitor lead-magnet gaps; Ikeuchi-style segment language and keeping complaints with their context (L1507-1584, L1698-1735).
15. The **"I know this sounds crazy" follow-up** move and its lesson that the trust gap is closed by showing effort ("A scammer would never go to this level of effort") (L901-912).
16. The Ultimate 3-email sequence (Email 2 softer CTA, Email 3 right-person) and its clash with the 2-hour SOP's Step 3 job (C18).
17. The reading-level clash: the summary says "6th-grade level or lower" but the library says **below 3rd grade** (C9). The other word caps: <50 words (5 things), <70 / 25-69 (enterprise) (C8).
18. Lead magnet levels 1-3 and the offer/lead-magnet ideas by service list; the "Offer Introduction" guarantee list and why it is too hype (L3271-3462).
19. Incentive offers: $25 gift card for taking the call, AirPods ROI math (L3138-3186).
20. The 100 one-line offers, the full Template Library (about 120 templates) and all the swipe emails.
21. Next-campaign extras: "Write down who you're testing, what you're saying, and why"; "Changing the copy doesn't fix a sending problem"; monthly rinse-and-repeat; and the newsletter's ready-made **Claude prompt** for designing the next experiment (L1687-1693, L1295-1310).
22. The list prompts (/DEEP 10 domains, DiscoLike ICP description with ~30 examples, list usability scoring) and "use ICP Prompt, it will outperform manually selected lookalike domains ... 80% of the time" (L254, L3529-3691).
23. The **Lead FLO Marketing** record embedded in the doc as the prompt's worked input, including the offer-validation thesis (9 tests) that breaks Rule 3, and Alex's "for positioning only" benchmark request (L4813-5459).
24. The **plaintext credentials and webhook URLs** inside the SOP export (C27).
25. That most example proof belongs to other agencies or creators ($220k, 1,326 campaigns, Leadbird, Closers.io, ListKit, Russell Brunson, Ikeuchi...). It must never be stated as Dulcy's (C20).
26. Step 4 and open/click tracking are not covered at all (UNKNOWN).

**Got wrong or now outdated:**
- It lists "Subjects: 1–3 words, 3 spintax variants ..., no punctuation" as the SOP rule. That comes only from the enterprise prompt; the library and guide examples break it (C13).
- "LinkedIn (HeyReach) is broken today, so skip it" is not in the SOP. The SOP has full HeyReach launch steps (L575-612). The "broken" status comes from CLAUDE.md.
- Its conflict table marks proof count and variants as "UNKNOWN until Alex decides". RULES 2026-11-25 has since decided both: ≥1 strong proof; 2 angles of Email 1. Its "CTA: a meeting is OK as a clear next step" is now narrowed by RULES: no call ask in the cold sequence unless it is the only logical next step.
- It says "Approvals: none" for the SOP. The SOP actually has a launch flow with no approval step, plus a prompt line telling the AI not to ask for approval (C21).
- It missed the SOP's internal proof clash: Step 1 says "one proof", the checklist says "at least 2" (C2).

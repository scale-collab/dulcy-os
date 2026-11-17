# Pixel Paid Ads Playbook

## Funnel comparison

### Group funnel
Use when the offer can be framed as a challenge, free training, free course, community, or other low-friction entry point.

Characteristics:
- Easy to validate
- Low budget requirement
- Low technical complexity
- Low copy complexity
- Low-to-medium scaling ceiling compared with VSL/direct-response funnels

Operating notes:
- Run ads directly to the group or group-entry experience.
- Frame the entry point as a useful free asset or challenge, not merely “join my group.”
- Success is heavily influenced by lead quality and DM setting/follow-up.
- A healthy join rate is roughly 60%+ when the signup step is working properly.
- Email and nurture group leads frequently.

Initial test:
- Roughly $60–$150/day when economics support it.
- Optimize for the lead/join event available in the setup.

### DM Ads
Use when the goal is to start conversations with low friction and the offer can be explained through a short message exchange.

Characteristics:
- Easy-to-medium validation difficulty
- Easiest technical setup among the core funnels
- Can validate with one solid video creative, though multiple angles are preferred
- Medium scalability

Starting KPI references:
- Direct message-start cost: around $30/message as a rough direct-response reference; B2B can be higher.
- Indirect / lower-friction message starts: roughly $5–$10/message where applicable.
- Booked-call cost: aim for roughly $300 or less unless client economics justify more.

Initial structure:
- 3 campaigns, one per major angle
- CBO
- 2 ad sets per campaign using the top 2 audience hypotheses
- Roughly $60–$150/day per campaign depending on target KPI and budget

### VSL / webinar funnel
Use when the offer requires explanation, proof, education, or pre-selling before the prospect is ready to book.

Characteristics:
- Medium-to-hard validation
- Higher CPL / booked-call cost than DM or group funnels
- More technical tracking
- Higher copy/creative skill requirement
- High scaling potential

Starting KPI references:
- B2C CPL: around $50 as a rough benchmark.
- B2B CPL: around $100–$150 as a rough benchmark.
- B2C booked calls: roughly $300 or less where unit economics support it.
- B2B booked calls: roughly $400 or less where unit economics support it.

Initial budget:
- Roughly $100–$300/day depending on KPI target and conversion volume needed.

### Direct-to-sale
Use only when the offer, proof, copy, tracking, and creative engine are already mature.

Characteristics:
- Hardest to validate
- High creative/copy skill requirement
- High technical demand
- Requires ongoing creative testing
- Can scale very high when it works

Default rule: do not start here unless the operator has already demonstrated competence with a VSL or similarly demanding funnel and the offer is already proven.

## Validation framework

Treat ad testing like the scientific method.

If ads do not work, the root cause is usually one of:
1. Offer
2. Copy / creative
3. Media buying / audience / delivery
4. Tracking or funnel implementation

A tiny TAM can also make the channel structurally difficult. Be cautious when the reachable audience is under roughly 20,000 unless the market is enterprise/high value.

### Conversion-volume rule
Aim for roughly 30+ optimization-event fires per week per campaign when possible. Treat 15/week as a practical minimum for learning before drawing strong conclusions.

### Test duration
Run a real test for at least 4–6 days unless there is a clear technical failure or policy issue.

### Spend threshold
A useful validation rule is to spend roughly 3–5× the target KPI before judging a hypothesis.

Example: if the target booked-call cost is $300, one weak $75 day does not prove failure.

## Creative testing

### Test angles before micro-variations
Start with 3–5 distinct hypotheses about why the audience should care.

Examples of angles:
- desired outcome
- cost reduction / economics
- speed
- risk reversal
- proof / case study
- competitive gap
- operational pain
- status / market position

Variations include:
- first-line changes
- background changes
- face/no face
- hook wording
- crop
- border
- banner
- different B-roll

Use variations to refine a winning angle, not to substitute for angle testing.

Dynamic creative can be used when helpful, but it does not replace clear hypothesis design.

## Audience strategy

Begin with 1–2 strong audience hypotheses per campaign rather than dozens of weak segments.

Possible hypotheses:
- broad / algorithmic
- customer or lead lookalikes
- high-quality conversion lookalikes
- role/interest or niche-based targeting when platform targeting permits
- retargeting pools

Do not interpret an audience win if creative or offer changed at the same time.

## Tracking

### DM / native lead-form funnels
A simpler pixel setup may be sufficient because the conversion happens inside the platform, but verify the account has the correct pixel/event configuration.

### Group / VSL / external-page funnels
Install the pixel and relevant conversion events.

For a VSL funnel, useful events include:
- lead
- application
- schedule / booked call

Use CAPI when available and useful.

Common implementation options in the user’s operating environment:
- GHL Facebook CAPI
- Zapier
- ClickFunnels/native integrations
- Hyros + Stape for more advanced tracking, especially once spend is above roughly $300/day and the added accuracy is economically justified

## Retargeting

Create retargeting audiences for:
- site visitors
- leads
- applicants
- booked calls
- social engagers

Use proven ads or strong proof-heavy creatives.

Starting allocation: around 10% of total spend, then adjust based on audience size and frequency.

## Account safety / ban avoidance

Use legitimate business infrastructure:
- operate through business.facebook.com
- verify the Business Manager
- enable 2FA
- maintain two valid payment methods where possible
- use a real website with Terms and Privacy pages
- maintain real page content
- use owned domains and working URLs
- avoid unsupported/disallowed claims and sensitive personal-attribute callouts
- avoid inflammatory, political, or highly negative phrasing unless the platform explicitly permits the specific context
- warm/prime new ad accounts with compliant ads before aggressive scaling

When platform policy may have changed, verify current Meta policy before implementation.

## Daily optimization

### If within KPI
Do not touch the campaign unnecessarily.

### If borderline
Cut gently. A reasonable guide is no more than roughly 33% every 4–5 days when performance is marginal but not broken.

### If a campaign slips
Consider reducing budget by roughly 20–50% rather than immediately killing a campaign with a strong history.

Prefer launching new campaigns or tests over repeatedly editing a working campaign.

## Scaling methods

### Vertical
- duplicate and raise budget
- increase budget carefully
- occasionally change optimization event when the funnel has enough data and the strategy supports it

### Horizontal
- duplicate to new audiences
- launch the same winner into new geographies or segments
- use new creative variations around the winning angle

### Spherical
- new creative concept
- new buyer segment
- new offer framing
- new funnel hypothesis

## Business-level diagnosis

Paid ads are not judged only by CTR, CPM, or CPL.

Trace the economics:
Spend → lead/message → booked call → held call → offer → close → cash collected.

If CPL is healthy but booked-call cost is poor, investigate funnel quality and follow-up.
If booked-call cost is healthy but close rate is poor, involve Cole.
If every audience and creative struggles to create meaningful intent, involve Forge and reassess the offer.
If tracking is inconsistent, involve Riley before drawing conclusions.

## Source-derived operating principles

The user’s training emphasizes:
- Meta Ads setup, audience strategy, lookalikes, validation mindset, and pixel/conversion tracking as core capabilities.
- Paid ads funnels should be supported by proper KPI tracking and a complete path from ads to landing page/form/calendar/sales call.
- Offers should be cold-traffic friendly and specific; channel selection should match offer complexity and trust requirements.
- Paid ads can scale offers that already demonstrate market demand, but the channel cannot rescue a fundamentally weak offer.

# Channel follow-up: actual failures versus unknowns
Read-only evidence checkpoint: 17 November 2026. Supplements channels.md. No calls, campaigns, workflows, suppression settings or messages changed.

## Bottom line
The caller is not merely suffering from low pickup. Actual transcripts show incorrect outcome labels, a failed scheduling interaction labeled booked, poor voicemail/gatekeeper handling, and calling people without honoring their reply intent. These are demonstrated failure modes, not proof of each one's share of lost revenue. LinkedIn has a documented unfinished companion-integration migration plus unreliable/duplicated reporting records. Direct-mail fulfillment remains unverified: the available evidence establishes intake, not a specific mailing failure.

## AI caller: measured evidence and its limits
Read all 173 Airtable Emails records with nonempty Call ID, across two pages (100 + 73, pagination exhausted). Filtered to 130 records whose Campaign Name begins [Dulcy]; excluded 43 other-client/untracked/test/blank-campaign records.

Latest saved status across those 130 Dulcy records:
| Status | Records | Share of 130 |
|---|---:|---:|
| Reached voicemail | 72 | 55.4% |
| Answered, NONE | 19 | 14.6% |
| Blank status | 15 | 11.5% |
| Busy, callback requested | 12 | 9.2% |
| Interested, did not book | 4 | 3.1% |
| Not interested | 3 | 2.3% |
| Turned DNC | 2 | 1.5% |
| Busy, no callback requested | 2 | 1.5% |
| Interested, booked | 1 | 0.8% |

Twenty have no saved transcript. Sixteen have Date of Call Booked populated, but none has Meeting Booked At populated. Those fields are not interchangeable: a date could originate from email, an earlier call, or stale state.

**These are mutable latest-per-lead records, not 130 call attempts, not a November cohort, and not a valid conversion rate.** Airtable createdTime dates the lead record, not the call. No attempt timestamps or version-linked history were established. Do not say the caller booked only one real meeting, or that it produced a 0.8% booking conversion.

### Strongest concrete failures
1. **A failed booking is labeled booked.** Douglas Goddard, the sole Dulcy record labeled Interested (Booked Appointment), agreed to approximately 9 a.m. Pacific. The bot then repeatedly reported scheduling trouble and promised to confirm later by email/phone. The transcript ends without a successful booking confirmation. This establishes a disposition error relative to the transcript, not that a later human booking never occurred. [Record](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recASuHMcmsI8KfYQ). The tool response did not establish the call date.
2. **Automated screening becomes false interest.** Colin Cimino is labeled interested/not booked, but the transcript is a call-screening system saying the person is unavailable, followed by the bot leaving a message. There is no prospect interest expressed. Call ID f162e950-869c-4265-9006-2bc1aa35fc38. [Record](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/rec4FWzdW5EhtkRU4).
3. **False callback requests.** Mary Oyom and George Hurley are labeled Busy (Call-Back Requested), but the shown transcripts contain automated screening/unavailability, not a recipient requesting another call. This could contaminate retry targeting; the review did not trace the actual retry branch. [Mary](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/rec1gp0l6vqYANaPg), [George](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recYEkd3OzOSiHDoJ).
4. **Asset intent is not respected promptly.** Bob Ramsay wanted the video originally offered, not discovery. He repeatedly requested it while the bot initially asked why he replied. It eventually promised to send the video. “Are you still on the line?” suggests a possible response-delay problem, but without timing/audio this is not proof of latency or its cause. [Record](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recOEXiCnXnp2WG7j).
5. **Referral context missed; explicit AI objection.** Sophia said she had already forwarded the email to her CEO and was not the decision-maker. She then rejected an AI conversation in favor of real people/relationships. This demonstrates at least one avoidable wrong-recipient follow-up and one explicit AI objection, not a channel-wide AI rejection rate. [Record](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recP1HkdJL94HB6Uc).
6. **Gatekeeper and voicemail behavior is brittle.** Robin's gatekeeper said Robin was absent; the bot subsequently asked to be put through anyway. Arden's office voicemail was followed by repeated introductions and questions about whether the recipient was still there. [Robin](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recTSgvpZkT1higwd), [Arden](https://airtable.com/appxqINt5XKw7a76A/tblADFhWhTcLrl1UY/recY3qTIATUCowy3k).

Call timestamps are not established for these transcript examples. They cannot be attributed to the currently published prompt or treated as post-November-13 regression evidence without provider history.

### Dated calendar incident
Nov 13: Alex reported offered Monday despite Monday/Friday exclusion. Kevin advised prompt restrictions and suggested GHL endpoint/integration changes. The latter remains a hypothesis. Alex subsequently said he published the corrected caller and marked it done. Do not describe it as an unpublished draft. No successful post-publication end-to-end booking receipt was established.
- [Team scheduling discussion](https://dulcy-media.slack.com/archives/C08FM9KPHJR/p1794510762775969), Nov 12–13 context, reread in this review.
- [Kevin's explanation](https://dulcy-media.slack.com/archives/D08B0JFQXHQ/p1794515815469059), Nov 13 UTC, reread.

### What to fix/validate first, not yet executed
- Separate machine screening, voicemail, human conversation, expressed interest, requested callback, and confirmed calendar booking. Require actual booking-action receipt before “booked.”
- Route by the actual email reply: fulfill requested asset, honor referral, respect opt-out, and ask for a meeting only when appropriate.
- Validate calendar timezone, excluded days, actual booking receipt and failure fallback against the published version.
- Export provider attempt timestamps, agent/version, action logs and audio for a dated before/after cohort. Measure attempted → human connected → qualified → actually booked → held.
- Do not blame spam labeling, dialing time, voice quality, GHL changes or latency as the dominant cause without that evidence. DNC counters alone do not prove calls occurred after opt-out.

## LinkedIn: more than “not built,” but not verified operational
The Nov 4–6 project artifacts document an old parent branch that imported the entire cold CSV, contrary to the approved positive-email-reply-only companion design. A replacement worker/candidate was staged, tested partly, and explicitly left inactive/unpublished in the last saved implementation record. Ledger installation, exact workspace/source-campaign mapping, safe partial recovery, positive-reply enrollment, and latest asset-dependent copy contract remained deployment/validation gaps. See channels.md for artifact paths and tests. These historical artifacts are not a fresh read of the current production workflow.

**New live Airtable read:** all 25 LinkedIn Campaigns records returned. Historical outbound activity does exist; the channel must not be described as never having worked:
- Clutch Free Leads (Google), campaign 81906: 2,642 leads, 882 connection requests, 17 replies, Stopped; updated Dec 31, 2025.
- MISS G550, campaign 159968: 129 leads, 127 connection requests, 12 replies, Completed; updated Apr 10, 2026.
- Broad Agencies campaign 312655 appears three times: one stale Active record with 8 leads/7 requests/0 replies (updated Mar 5), and two Completed records each 31/30/2 (updated Jul 20). **Do not sum duplicates or infer currently active from the stale row.**
- Content Agencies campaign 312657 appears twice, both 9 leads/0 connection requests/0 replies, Completed, updated Nov 17 around 07:30 UTC. This is a specific reconciliation target, not proof of why none were sent.
- No Meeting Booked values were returned in the selected fields.

[LinkedIn Campaigns table](https://airtable.com/appxqINt5XKw7a76A/tbl7s4Q7ccNy5aSSW). Native HeyReach verification is still needed to resolve current status and enrollment behavior. Organic LinkedIn posts scheduled Nov 16 are a different pipeline.

## Direct mail: do not invent a root cause
Additional connector/search review still did not identify a verified physical-mail job, provider failure, dispatched-piece receipt or delivery result. Search coverage is incomplete; empty search results cannot establish no system exists. Nov 16 contract/intake implementation supports a Direct Mail checkbox and unsent agreement drafts; it does not establish fulfillment.

The concrete gap is **unknown fulfillment ownership and observability**, not a proven print/mail API defect. Before proposing repair, identify the actual provider/owner, approved address source, trigger and most recent job ID; reconcile proof approval, spend authorization, submitted pieces and dispatch receipts. The old website-visitor field must not be repurposed as Direct Mail. See channels.md for the intake form and dated implementation report.

## Recommended decision order
1. Caller: repair measurement and intent routing; controlled published-calendar validation. Do not scale based on the current labels.
2. LinkedIn: audit native current deployment against the approved positive-reply-only design; deduplicate reporting and validate one complete safe enrollment lifecycle.
3. Direct mail: establish the actual fulfillment system and last job before spending engineering time on a guessed fix.


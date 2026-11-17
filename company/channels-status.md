# Channel status

Last updated 2026-11-17. Evidence detail: `channel-evidence-2026-11-17.md` (read it before proposing any fix).

| Channel | Status | What is proven |
|---|---|---|
| Cold email | WORKING | Only active channel. EmailBison sends. Campaign-build errors: see `../automations/n8n-workflows/campaign-center/BUILD-ERRORS-2026-11-17.md` and `../rules/build-error-playbook.md`. |
| LinkedIn (HeyReach) | HISTORICALLY RAN, now unfinished | 25 campaign records show real past outreach (e.g. 882 connection requests, 17 replies on one). Old parent flow imported the whole cold CSV instead of the approved positive-email-reply-only design. A replacement was built, partly tested, left inactive. Reporting has duplicate rows (do not sum them). Live HeyReach status UNVERIFIED. |
| Direct mail (handwritten cards) | UNKNOWN owner and fulfillment | Intake exists (Direct Mail checkbox, unsent agreement drafts). No proven mailing job, provider failure or delivery receipt found. Do not guess a root cause. First find the provider, owner, trigger and last job ID. |
| AI caller | UNDERPERFORMING, direction undecided | Proven failures are labeling and routing, not just pickup: a failed booking labeled booked, voicemail/screening labeled interested or callback, asset requests ignored, referrals missed, gatekeeper handling brittle. Measured numbers are latest-status per lead (130 Dulcy records), NOT a conversion rate. Corrected calendar prompt published Nov 13; no end-to-end booking receipt yet. |

## Open questions
- LinkedIn: current live HeyReach status and enrollment behavior.
- Direct mail: who runs fulfillment, which provider, last job.
- AI caller: provider attempt timestamps, agent version, action logs, audio (needed for a real attempted -> connected -> booked -> held funnel). Decide: fix routing or replace with humans.

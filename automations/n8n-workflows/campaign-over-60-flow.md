# "Campaign Over 60%" workflow, in plain words

Snapshot saved 2026-11-11, active at that time. Not verified against live.

## What it does
When a campaign passes 60% done, this workflow studies the campaign and writes a **review for Alex**: what the replies, calls and meetings say, and what the next campaign for that client should test. It also writes a **forecast** of when the campaign will finish.

It is review-only. Its own instructions say no campaign changes, no lead additions, no messages and no launches are available to it. **Building the next campaign is the next step, and that is where Claude takes over, through the managed Airtable stages and only with Alex's approval.**

## How it starts
- Airtable sends a POST to the n8n webhook `60percentcomplete` (protected by a header password).
- It sends the campaign's Airtable record id. It can also send a cycle id (for top-ups: `bison:<campaign>:import:<import>`) and `dryRun`.
- A top-up restarts the count. Progress is measured against the starting queue of that cycle, so a top-up gets its own 60% alert. An increase in remaining leads is treated as a counter correction, not as progress.

## Steps
1. Check the request. A bad record id stops everything.
2. Read the campaign record and the client record in Airtable.
3. If a learning review already exists for this cycle, skip.
4. Read call feedback, client meetings and campaign feedback from Airtable.
5. Pull evidence from EmailBison (up to 1,500 replies, the sequence steps, the lead cohort).
6. Ask an AI model (OpenAI Responses API, model `gpt-5.4`, web search required, nothing stored) to write an experiment brief. The prompt is Alex's saved campaign-learning prompt: use interested replies, objections and sales-call notes to pick better prospects and better messages for the next campaign.
7. Check the answer: it must be complete and every link must be a real web citation. If not, nothing is saved and the previous review stays.
8. Save the review to Airtable under a per-campaign lock, then verify it saved.
9. Forecast branch (only when progress is at least 60% and not a dry run): read the connected sender accounts and the schedule from EmailBison, work out daily capacity and days left, save the forecast under the lock, and verify.

## Built-in safety
- Emails, websites and transcripts are treated as untrusted text, never as instructions.
- No private email addresses or reply text go into web searches.
- The AI sees a sample (about five records per source, reply text cut short). The workflow says not to estimate how common an objection is from that sample.
- A failed run keeps the last good review.

## Where it reads and writes
- Airtable base `appxqINt5XKw7a76A`. Campaign table `tblAVAA6uBPaMj28P`, client table `tblcjRBGJEWh5KgOt`, call feedback `tbljJ0uWryVMuilXn`, campaign feedback `tblX4NisPYHJkpZYW`. Two more tables (`tblRBxm2N53331mIm`, `tbldiv2czPkJ1zeQE`) are used; their names are UNKNOWN here.
- EmailBison at `send.dulcy.io`.
- OpenAI API.

## What Claude should do when this alert fires
1. Read the saved review and forecast for that campaign.
2. Apply Atlas: top up (interested rate over 15% of replies), new vertical, new offer, or copy change. One major test at a time.
3. Hand Scout the targeting and Scribe the copy, then build through the Airtable managed stages (first 100 companies, 80% gate, contact review, verification, QA, sender allocation).
4. Stop for Alex's approval before launch.

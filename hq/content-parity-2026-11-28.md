# HQ Content vs the Airtable Content Center: parity audit (11/28)

**Result:** 84 of the Content Center's 88 views, panels, fields, buttons and settings are in HQ (52 were already there, 32 built today). 2 were left out on purpose because of a rule (the "open in Airtable" links). 2 can't move: the clip review buttons (they need Airtable to say *who* wrote the decision).

Source checked: `airtable/custom-elements/content-center/source.tsx` (all of it), against `hq/web/src/pages/Content.tsx`, `hq/web/src/pages/content/*`, `engine/src/hq/content.ts`, `contentActions.ts` and the new `contentCenter.ts`. There is no `contentReview.ts` in the repo.

Status key: **had** = in HQ before today · **built** = added today, wired like the Content Center · **rule** = left out on purpose because of a rule · **can't move** = needs something HQ can't do (reason and smallest fix below).

## A. Layout and the list

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 1 | Content / Calendar switch | Content → tabs Content, Calendar (plus Needs you, Friday) | had |
| 2 | Search content | Content tab → search box | had |
| 3 | "Hide older and completed history" | Content tab → "Show finished videos" + "Show older and rejected items" (`/content?history=1`: rejected / duplicate / archived ideas, rows with no channel, rows older than 60 days) | built |
| 4 | List row: title, stage, Record / Publish date, status when no date | Content tab list | had |
| 5 | List row: error icon | Content tab list (alert icon) | had |
| 6 | List row: "This week" tag | Content tab list | had |
| 7 | Order: earliest date first | Content tab list | had |
| 8 | Notice bar after each action | The answer under each button | had |

## B. Header: add idea and settings (the gear)

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 9 | + Add content idea (title, notes) | Needs you and Content → "Add content idea": Title, Description, Idea Decision "Needs Review", Content Source "Manual Idea", Content Channel. HQ adds the channel choice (the Content Center always wrote Alex Woung). Its date boxes are not saved by the Content Center either, so HQ has none | built |
| 10 | Settings: channel tabs (Alex Woung / Alex Woung Raw) | Content → wrench → Content scheduling settings | built |
| 11 | Videos per week (Alex Woung fixed at 2) | Settings | built |
| 12 | Minimum spacing between videos (Alex Woung fixed at 2 days) | Settings | built |
| 13 | Manual-review score | Settings | built |
| 14 | Minimum clip score | Settings | built |
| 15 | Clips per week | Settings | built |
| 16 | Reset defaults | Settings | built |
| 17 | Save settings: both records in one write, Enabled ✓, Auto Schedule Score written back unchanged; refused if a channel has no record | Settings → Save settings (`POST /content/settings`) | built |
| 18 | The cadence sentence ("schedules up to N a week, N days apart…") | Settings | built |

## C. The video's header

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 19 | Stage label, "Record this week" | Video page, top card | had |
| 20 | "Distribution complete: N scheduled, N published" (its completion check) | Video page → Distribution: "Distribution complete: …" or what is still missing (`distributionCompletion` ported, fresh read of the video's drafts) | built |
| 21 | Open Airtable record | Not in HQ: no Airtable record links (RULES 2026-11-27). HQ edits the same fields itself | rule |
| 22 | Delete (trash + confirm) | Video page → Details → "Delete this content record" → "Delete from Airtable" (one record; files, clips, videos and posts kept; logged) | built |

## D. Content schedule

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 23 | The channel's cadence line | Video page → Schedule | had |
| 24 | Approve & schedule / Reject idea | Needs you and the video page (same fields and dates rule) | had |
| 25 | Editorial score | Needs you, video page | had |
| 26 | Why this idea qualified (Idea Qualification Reason) | Video page → Schedule and Details | built |
| 27 | "Content for" (Content Channel) | Video page → Schedule; Needs you → "No channel yet" group | built |
| 28 | Recording date box (only once approved) | Video page → Schedule | built |
| 29 | Publish date box (only once approved) | Video page → Schedule | built |

## E. Next step

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 30 | Recommended next step + its one button | Video page → Next step | had |
| 31 | Open the Frame.io folder | Steps (Upload to the Raw folder / Open the Final folder) | had |
| 32 | "… is already queued" | "Running: …" pill and note | had |
| 33 | Retry draft generation | Posts step → Retry the posts | had |

## F. Clips review (the review panel's Clips tab)

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 34 | Review clips in OpusClip (short-clips project link) | Video page → Clips → "All candidates in OpusClip" | built |
| 35 | Shortlist: score, verified status, preview, Opus identity, review version, editorial notes, transcript | Video page → Clips (best score first; the verified copy over the imported media) | built |
| 36 | Final clip ID box + Refresh current preview | Content Center only | can't move |
| 37 | Approve reviewed copy / Reject copy | Content Center only (HQ: "Open the clip review") | can't move |

## G. Script

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 38 | Copy script | Video page → Script | had |
| 39 | Regenerate script | Video page → Next step → "Regenerate script" (n8n Generate Teleprompter Script, `{recordId, action}`) | built |

## H. Thumbnail

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 40 | Generate thumbnail | Thumbnail step | had |
| 41 | Status | Thumbnail step, YouTube box | had |
| 42 | Open current thumbnail | Thumbnail step | had |
| 43 | Open previous thumbnail | Video page → YouTube upload → "Previous thumbnail" | built |
| 44 | Request thumbnail changes (2,000 characters, 202 + same request id) | Thumbnail step | had |
| 45 | Approve thumbnail | Thumbnail step | had |

## I. YouTube upload

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 46 | Title, description, chapters boxes with Copy | Video page → YouTube upload (editable) | built |
| 47 | Generate missing details (n8n; else the channel template from what is typed, chapters only when typed) | YouTube upload → Generate missing details | built |
| 48 | Save YouTube details (chapters empty = cleared) | YouTube upload → Save YouTube details | built |
| 49 | Upload to YouTube (Studio link) | YouTube upload, "Post on YouTube" step | had |
| 50 | YouTube URL → Save URL and continue | "Post on YouTube" step → Save the YouTube link | had |

## J. Repurposing brief

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 51 | Clips wanted | Posts step → Choose where the posts go | had |
| 52 | "Using minimum score N from Settings" | Same: now the channel's Minimum Clip Score from Settings (HQ used to let you type one) | built |
| 53 | Channel toggles (Resource "coming soon") | Same (Resource stays off, like the Content Center) | had |
| 54 | Save / Save and generate drafts | Same | had |

## K. Editing path

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 55 | Use OpusClip / Use DaVinci Resolve | Record and Edit steps | had |
| 56 | Upload recording (Raw folder) | Record step, Friday step 4 | had |
| 57 | Sync Frame.io | Record / Edit / Clips steps, Friday step 4 | had |
| 58 | Upload finalized video (Final folder) | Edit step | had |
| 59 | 1. Edit full video | Edit step | had |
| 60 | 2. Create short clips | Clips step | had |
| 61 | Check clip status | Clips step | had |
| 62 | Set up Frame.io | Folder step | had |

## L. Status and details

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 63 | 10-stage progress bar | Stage label + "All steps" (done / now / later) | had |
| 64 | Video card, Repurposing card | Video page → Details | had |
| 65 | Latest update / Needs attention | Video page | had |
| 66 | Advanced details (production stage, OpusClip status, short-clips job, thumbnail, publishing, score, source, decision) | Video page → Details | had |
| 67 | Original Reddit post | Video page → Details | had |
| 68 | Edit all fields in Airtable | Not in HQ (RULES 2026-11-27, as #21) | rule |

## M. Posts review (the review panel's Posts tab) → HQ Distribution

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 69 | Platform tabs with counts | Distribution: one row per platform with its count | had |
| 70 | Draft title, copy, approval | Distribution → each draft | had |
| 71 | Copy post | Distribution | had |
| 72 | Copy title (Reddit) | Distribution | built |
| 73 | "Post this once in r/…" + Open r/… (subreddit from the record id, same hash) | Distribution | built |
| 74 | Open X composer (with the text) / Open LinkedIn | Distribution | built |
| 75 | Newsletter email preview | Distribution → Email preview (same branded HTML, sandboxed) | built |
| 76 | Copy HTML | Distribution | built |
| 77 | Newsletter audience note (Close, Subscribed = Yes; approving sends nothing) | Distribution | built |
| 78 | Preview attached clip | Distribution → Open the clip | had |
| 79 | Open the finished output (Published URL) | Distribution → Post link | had |
| 80 | Suggested posting time | Distribution → the Schedule box starts at the Content Center's suggested time | built |
| 81 | Approve and save time (approve + scheduling webhook in one press) | Approve, then Schedule (same writes, same webhook `{distributionRecordId}`; two presses because approve never schedules: RULES 2026-11-28) | had |
| 82 | Approve newsletter draft (preview webhook) | Distribution | had |
| 83 | Approve blog (unpublished Framer draft) | Distribution | had |
| 84 | Resource / Gamma (paused) | Refused the same way ("coming soon") | had |
| 85 | Needs changes | Distribution | had |
| 86 | Mark as published (Reddit / X / LinkedIn URL) | Distribution → Record the post (+ views, likes, comments; TikTok too) | had |

## N. Calendar

| # | Content Center | HQ (where) | Status |
|---|---|---|---|
| 87 | Month grid, previous / next / this month, All / Recording / Publish dates | Calendar tab | had |
| 88 | Unscheduled active content | Calendar tab → No date yet | had |

## The settings Alex named, where each one is now

- **Content Automation Settings** (videos per week, spacing, review score, clip score, clips per week): HQ → Content → wrench (#10–18).
- **Channels**: the video's channel (#27); where its posts go (#51–54).
- **Cadence**: settings #11–12; the dates rule on approve (#24) and the date boxes (#28–29).
- **Idea generation**: automatic (Sienna Friday 7 AM + the n8n Reddit intakes). The Content Center has no button for it; its Manual-review score is in settings (#13); manual ideas: #9.
- **Research / sources**: idea source and original post (#66–67), why it qualified (#26). The three subreddits are fixed in the Content Center's code, not a setting.
- **OpusClip settings**: minimum clip score and clips per week (#14–15), clips wanted (#51), editing route (#55), the OpusClip project (#34).
- **Distribution channels**: #53.
- **Newsletter / blog / Framer**: #75–77, #82–83.
- **Resources (Gamma)**: paused in the Content Center (`RESOURCE_AUTOMATION_ENABLED = false`); HQ refuses it the same way (#84).

## Can't move (2)

**Problem:** the clip review buttons (#36 Refresh current preview, #37 Approve reviewed copy / Reject copy).
**Data:** the button writes Review Intent JSON on the clip, then calls n8n "[Content OS] Current Clip Review and Preview". That flow checks Review Intent Author (a "last modified by" field) is `usrZ0Hn36coHFxw3D` / team@dulcy.io, for all three actions. A write from HQ is authored by whoever owns HQ's Airtable token, which proves nothing about who pressed the button.
**Smallest fix:** check the token's owner once with Airtable's `GET /v0/meta/whoami`. If it is team@dulcy.io, HQ can write the same intent and call the same webhook (owner-only route, Alex's session), and the flow passes unchanged. If not, n8n must also accept an intent HQ signs (an HMAC with a secret both share) as owner proof. Either way it needs Alex's OK, because it changes what "the owner approved this clip" proves.
**Why:** a clip approval decides what gets posted; the flow was built so only Alex's own Airtable account can make it.

## Left out by rule (2)

#21 and #68 ("Open Airtable record", "Edit all fields in Airtable"): HQ has no Airtable record links (RULES 2026-11-27). Every field the Content Center edits is edited in HQ now.

## Tests

`engine/test/hqContentParity.test.ts` (fake Airtable, fake fetch: no webhook fired, nothing posted, nothing really deleted): the exact settings write (both records, clamps, Alex Woung fixed, refused with a missing record), the add-idea create, channel / date / YouTube writes and their guards, the template fallback with typed boxes, the brief's score from Settings, the clips shortlist, Reddit community, composer link, newsletter HTML, previous thumbnail, the completion check, the confirmed delete, history mode, and owner-only + same-origin on every new route.

# HQ phone pass, 2026-11-28

**Result:** every HQ screen checked at 390 × 664 (iPhone 13 in Safari) and 375 × 667 (iPhone SE 3rd gen), light and dark: no sideways scroll, nothing cut off that matters, tap targets 40 px or more, small print 13 px on a phone. The desktop (1440 px) is pixel-identical to the old build except the "read N min ago" lines.

**How it was checked:** the engine ran locally on a fake, empty Airtable with no outside calls, behind a small mock that answered every `/hq/api/*` screen with made-up data (fictional clients and people). Playwright visited 69 screens and sub-screens (sheets and the teleprompter opened by tapping), took screenshots and measured: page width, elements past the screen edge, controls under 40 px, text under 13 px, console errors. The 1440 px check compared every screen against the old build pixel by pixel.

## Fixed for every screen (shared)

| What | Problem | Fix |
|---|---|---|
| Bottom bar | Highlighted **Clients** on Sales and Finances | Highlights the right item, or none (Sales and Finances are not in the bar) |
| Phone header | Users icon never showed it was open | Shows active on Users |
| Home Screen app | Header, toast and view-as banner had no room for the iPhone status bar area | Safe-area padding (no change when the inset is 0) |
| Small print | 12 px meta lines everywhere (451 uses) | 13 px on a phone, HQ only (`:root.hq --text-xs`); desktop 12 px |
| Tap targets | Text buttons, chips, links, summaries 16-36 px tall | 40 px on a phone (`min-h-7/8/9` rule + per-spot fixes) |
| Wide tables | Scrolled in their box but the name column scrolled away | First column stays in view on a phone (`.sticky-first`) |
| Sideways scroll | A screen-reader label in an off-screen table column widened the page (Placement: 404 px on a 390 px phone) | Sideways-scrolling boxes hold their labels |
| Pills | Long client names spilled over the next element (Decisions card) | Text truncates inside the pill on a phone |
| Headers | Section headers squeezed their title; page-title buttons pushed the page sideways | They wrap |

## Per screen

| Screen | Problems found | Fixed / not fixed (why) |
|---|---|---|
| Today | 6: week tiles cut ("Interested r…", "Last we…"); group descriptions clamped; campaign names cut by the pill; report titles cut; to-do title link 21 px tall; pile chips 32 px | 6 fixed |
| Decisions (+ card) | 3: client pill overlapped the card arrows; arrows 36 px; "Open thread" / "Edit" 32-36 px | 3 fixed (arrows get their own row on a phone) |
| To-do (today / yesterday / tomorrow / steps) | 0 | – |
| Old to-do (#/tasks) | 0 | – |
| Inbox (+ thread, + Booked) | 2: prospect + company cut; thread email / subject cut | 2 fixed (wrap) |
| Clients | 4: KPI tile labels cut at 10-11 px; agency tile lines cut; Sales / Finances link lines cut; tables lost the client column when scrolled | 4 fixed |
| Client (+ inbox, + AI replier) | 4: results table name column; waiting titles cut; replier fields cut in 2 columns ("Brief (< 60 wor…"); switches 26-37 px | 4 fixed (one column of fields on a phone) |
| Sales (Action, Hottest, Numbers, Pipeline, Funnel, Pricing) | 6: action pill split the company ("acmeroofingsupply.co / m"); "Needs action" tab wrapped; Close link 20 px; pipeline stage names cut; funnel / capacity tile lines cut; pricing notes 11 px | 6 fixed |
| Sales deal | 3: stage labels cut ("Qualifi…"); Fathom / Dulcy Sign / Close links 20 px; review link 32 px | 3 fixed (stages 4 + 3 on a phone) |
| Draft contract | 1: Save / Create bar hidden behind the bottom bar | 1 fixed (sits above it) |
| Finances (Company, Personal, Both, costs sheet, invoice sheet) | 3: invoice contact cut; card table lost the card column; tile lines cut | 3 fixed; sheets fit with safe-area bottom (no change needed) |
| Campaigns (+ new-campaign sheet, Past, sender accounts) | 4: "Direct …" channel tab cut; sender box labels cut at 375 px ("Reserved N…"); per-client sender table lost the client column; plan links 32 px | 4 fixed (channel tabs 2 × 2 on a phone) |
| Campaign (Overview, Copy, Lead list, Senders, Plan, History, confirm sheet) | 3: number tile lines cut; engine "more" link 17 px; Scribe's notes 21 px | 3 fixed |
| Lead lists (+ a list) | 2: step line 11 px; "Go to …" link 20 px | 2 fixed |
| Deliverability (Attention, Inboxes, Bulk edit, Bounces, Verify, Placement, Domains) | 6: Placement scrolled sideways; per-client names cut; bulk-edit checkboxes 16 px; bar labels cut; bar rows 32 px; bounce code detail 11 px. Also "show them" link 17 px | 6 fixed; "show them" not fixed (a link inside a sentence) |
| Team (+ board, conversations, agent) | 3: tabs wrapped to 3 lines; board role cut; agent's waiting titles cut | 3 fixed (short tab labels on a phone) |
| Chat (+ chats list, new chat) | 1: chat title line under the agent name is cut | Not fixed: the full title is in the chats list and the first message; the line shares the row with Chats / New |
| Content (Needs, Content, video, Calendar, Friday, teleprompter) | 5: data-problem line cut; Friday step "3 Promp…" cut; teleprompter under the header and bottom bar; teleprompter Close / text size / Top below the screen; source link 17 px | 5 fixed |
| Users | 3: header buttons scrolled the page sideways (478 px); Send link squeezed the person's name and pills; emails cut | 3 fixed |
| Notifications | 1: switches 28 px tall | Fixed (44 px tap area; the switch looks the same) |
| Report (call review) | 0 (bottom bar shows Today, where reports open from) | – |

**Totals (per screen, on top of the shared fixes):** 65 problems found, 63 fixed, 2 not fixed (by choice, above).

## Round 2: screens merged after the first pass

Same checks at 390 × 664 and 375 × 667, plus a 1440 px desktop pixel diff against the merged build before these fixes (31 screens: identical apart from spinning icons and the live dot). All fixes are phone-only (`max-sm:`), so desktop does not change.

| Screen | Problems found | Fixed / not fixed (why) |
|---|---|---|
| Inbox (thread cards, Email 1/2/3, Echo last-hour strip, #/inbox/links, thread panel) | 1: Replier settings menu ran 47 px off the left edge (client names cut) | Fixed (menu opens from the button's left edge on a phone) |
| Campaigns (header, By hand sheet, Sync, New lead list sheet) | 1: New campaign / By hand / Sync / Refresh in one row scrolled the page sideways (558 px) | Fixed (buttons wrap to 2 rows on a phone); both sheets fit and scroll inside |
| Campaign tabs (Copy, Sequence, Settings, Variants, More, Senders, Plan) | 3: top-up "Linked" list link 20 px (More); "Open the lead list" 20 px (Plan); "+ Add variant" 20 px (Variants) | 3 fixed (40 px tap area; looks the same) |
| Lead list (+ Source, Verification, QA tab fields) | 0 | – |
| Content (Settings wrench panel, Add idea, channel picker, dates, history toggle, YouTube boxes, distribution, Gamma box, Delete) | 1: Final review "Watch this copy" link 20 px | Fixed (40 px tap area) |
| Resource page (#/content/items/…/resource, screen preview) | 1: slides shrank to the phone width, text 3.6–7 px | Fixed: on a phone the slides keep a 720 px width and swipe sideways inside their own box (headlines and body readable). Slide footer captions stay 7–8 px, the same proportion as the PDF. Print copy untouched |
| Voice mode (Talk in Chat and in the Finances / Sales chat box) | 0 (full screen, Close and status visible at both sizes) | – |
| Sales (goals card, Won sync line) and Deal (Calls) | 0 | – |
| Finances (Ledger chat box) | 0 | – |

**Round 2 totals:** 7 problems found, 7 fixed, 0 not fixed. 30 screens × 2 sizes: no sideways page scroll, no tap under 40 px, no text under 13 px outside the slide previews.

## For Alex to judge on the real phone

1. The Home Screen app: header under the status bar, bottom bar above the home line (checked in an emulator only).
2. Small print at 13 px: readable, or still too small for meta lines?
3. Wide tables (Clients results and profit, cards, sender accounts): swipe sideways with the name column fixed. Good enough, or should they become cards?
4. The teleprompter on the device while recording (now full screen with all buttons visible).
5. Sticky Send / Approve / Save bars with the keyboard open (Safari moves them; not testable in the emulator).
6. The resource preview on a phone: swipe the slides sideways, or is "Download PDF" enough there?
7. A 320 px wide phone (first iPhone SE): the header's 7 icons do not fit. Not a target; HQ needs 360 px or more.

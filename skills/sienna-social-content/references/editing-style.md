# Editing style guide: Alex Woung videos in OpusClip (Sienna)

Written 2026-11-25 from: 11 OpusClip clips checked (transcript, tracks, sampled frames), the Content Clips table (57 rows: 20 Approved, 0 Rejected, rest Needs Review), and frames of 10 Shorts and 4 long videos from 5 creators. Alex's rules in `rules/RULES.md` win over this file. Goal: Alex only approves finished videos, and never sees an obvious mistake.

## 1. Alex's hard rules (break one = reject the clip)
1. **One Alex on screen.** Never the same face twice: no top/bottom stack of the same camera, no face under a text box with a second face below.
2. **Alex Woung Raw: never split-screen.**
3. **Captions are correct.** Names, numbers, "cold email", tool names.
4. **No AI-slop text.** No generic AI titles, emoji confetti, foreign or off-topic hashtags, or claims Alex did not say.

## 2. Channel rules

### A. Main channel, long-form (YouTube, 16:9)
- **Layout:** landscape, single camera, Alex centred, head and hands in frame. Screen recordings full-frame or picture-in-picture, zoomed until the text is readable on a phone.
- **Captions:** no burned-in word-by-word captions. Upload a corrected caption file to YouTube instead (Mitchell Keller and Daniel Fazio long-form have no burned captions). Alex has not confirmed this yet (open question 2).
- **Overlays:** one lower-third name card the first time Alex appears ("Alex Woung · Founder, Dulcy"). Short boxed callouts only for a number, a tool name or a step he is saying right then. Max one callout on screen at a time.
- **Cut:** false starts, retakes, dead air over 0.7 s, `__missing` gaps, and tangents that go nowhere. Example from P3112318QoRD: "Do I even have it with me / No I don't" and "inc-inclash-inclination". Keep the intro (who I am + what you'll get) under 30 s.
- **OpusClip:** use no-clip mode (`skipSlicing: true`), `aspectRatio: landscape`, `removeFiller: true`, `enableCaption: false`.

### B. Main channel, Shorts / Reels cut from long-form (9:16)
- **Layout (default):** single speaker, "Fill", one face, centred, top of head not cropped.
- **Split-screen:** only while Alex shows a screen. The screen goes on top and his face goes on the bottom. Split for those seconds only, then back to a single face. Both halves must show different things.
- **Captions:** current look (white bold, black outline, 1-3 words, uppercase). Alex approved 20 clips with it. Place captions in the lower-middle band, never over his eyes or over screen text he is pointing at. Keyword highlight off, or one brand colour (open question 4). Emoji off.
- **Length:** 20-60 s. Up to 75 s only if every second is the lesson. The approved clips ran 19-69 s.
- **Hook (first 2 s):** Alex says the point or the problem. The clip starts at the start of a sentence. Never open with "So", "Now", "Most of you when it comes to…", "If you don't know who I am…", or mid-sentence. Gp5pYm4hfw opens "more often than not lately…", which fails this rule.
- **Hook text card (optional):** at most 8 words. It says what Alex says in the first 5 s, in his words. Shown for 3-5 s at the top, and only on a single-face layout. No number he did not say.
- **End:** stop on his last useful sentence. No QR "Learn more on our socials" end card and no music tail. Every approved clip had these removed by hand.
- **Title / description / hashtags:** the title is the claim in Alex's words, like the creators do ("Our most successful emails are between 30 and 70 words"). Never OpusClip's "Topic: Benefit" SEO format. 3-5 relevant English hashtags.

### C. Alex Woung Raw (secondary, 9:16, unpolished talking head)
- **Layout:** single face, Fill, always. Never split-screen, never a screen recording, never b-roll.
- **Captions:** same style as B. They must be correct. Raw means unpolished delivery, not sloppy text.
- **Overlays:** none. No hook card, no emoji, no music, no end card.
- **Cut:** only dead air over 1.0 s, false starts and retakes. Keep his natural pace and filler (`removeFiller: false`; `remove_pauses` with `minPauseSec: 1.0`).
- **Length:** 30-90 s (UNKNOWN: Alex has not said, and no Raw clips exist in OpusClip yet).

## 3. Proposed "Alex Woung" brand template in OpusClip (to create only after Alex's OK)
The only templates today are "Preset template 1" (default, caption animation "pop", portrait) and "dulcifyz" (gaming, "seamless-bounce"). The default brand kit appears to add the QR end card (it shows up in the newest project P311241877Ez too).

| Setting | Main Shorts | Raw |
|---|---|---|
| Aspect | portrait | portrait |
| Caption animation | pop (keep what Alex approved) | pop |
| Caption style | white, black outline, uppercase, position middle-low | same |
| Keyword highlight | off (or one Dulcy brand colour, UNKNOWN hex) | off |
| Emoji | off | off |
| Clip length (`clipDurationsSec`) | [[20,45],[45,60]] | [[30,90]] |
| Genre | leave unset (valid values UNKNOWN) | unset |
| Auto-hook (`enableAutoHook`) | **off** (AI text; it made the card over the duplicated face in NERDGSjzfM) | off |
| Filler removal (`removeFiller`) | on | off |
| Outro / end card | none | none |
| Layout | single speaker Fill; split only for screen demos | single speaker Fill, never split |

`customPrompt` for clipping: "B2B cold email and agency lessons from Alex Woung. Pick self-contained single lessons that start at a sentence start and end on a complete point. Skip intros, channel plugs and unfinished demos."

## 4. Pre-approval QA checklist (run on every clip; every answer must be "yes")
`opusclip_describe_clip` returns transcript, aspect, duration, score and hashtags, but **no visual description**. For the visual checks, sample frames from `preview_url` at 0.5 s, 25 %, 50 %, 75 % and the last second, then look at them. Source: T = transcript, K = `get_clip_tracks`, F = frames, M = metadata.

1. F: In every frame, is there exactly one image of Alex's face?
2. F: Is there no frame where the same camera shot appears twice (top and bottom)?
3. F (Raw only): Is every frame a single full-screen face with no split and no screen recording?
4. F (Main): If a split appears, is the top a screen and the bottom Alex, and is it only during a demo?
5. F: Is the top of Alex's head and his chin inside the frame?
6. F: Is the text box away from his face, and does it never sit on a second face?
7. F: Is the last frame Alex (no QR card, no logo card, no black)?
8. T: Does the clip start at the start of a sentence, with a clear point in the first 2 s?
9. T: Does it end on a finished sentence and a complete point (no "I'll show you in a sec")?
10. T: Are there no `__missing` gaps inside the clip?
11. T/F: Are names and tools spelled right: Alex Woung, Dulcy, cold email, EmailBison, EmailGuard, Clay, LeadMagic, DiscoLike, MillionVerifier, Smartlead, Apollo, Instantly, HeyReach, Calendly, n8n, ChatGPT, Hormozi?
12. T/F: Are numbers shown as digits that match what he said ("2027", not "two thousand and 27"; "6-figure")?
13. K: Is EmojiTrack absent, or emoji switched off?
14. M: Are the title and description his claim in his words, with no number or promise he did not say?
15. M: Are all hashtags English and on-topic (3-5 of them)?
16. T: Is this passage not already used in another clip for the same post?
17. M (Raw): Is there no TextOverlayTrack and no music?

**Fixing captions:** `replace_phrase` only swaps the same number of words (for example "Wong" → "Woung"). Anything else ("two thousand and 27" → "2027") goes to the OpusClip web editor. Every edit, export or schedule needs Alex's OK under `rules/RULES.md`.

## 5. Auto-reject (do not send to Alex)
- Any "no" on checks 1, 2, 3, 6 or 11.
- Starts mid-sentence or ends on a promise of something not in the clip.
- Overlaps another clip from the same passage. Keep the shorter, cleaner one.
- Title, caption or overlay adds a result, percentage or guarantee Alex did not say, or turns a past example into a current offer ("7x more qualified meetings", "Boosted replies to 25%").
- Sensitive personal or client detail Alex has not cleared (therapy, a named former client or team member, client revenue).

## 6. What the creators do that we copy
Evidence: frames at about 25/50/75 % of each video plus titles. Hook wording, exact lengths, b-roll cadence and CTAs are **UNKNOWN**: no transcripts were pulled (vidIQ costs credits; YouTube blocked further page loads).

- **Mitchell Keller** (Alex's favourite). In Shorts, his face appears once, cut out at the bottom, with a simple illustration or keyword headline above it; small sentence-case captions. Long-form is a single desk camera with a name lower-third, small boxed side callouts ("AI models hallucinate", "Free newsletter… link below") and no burned captions. Titles are plain claims. Copy: one face, plain-claim titles, small callouts in long-form. https://www.youtube.com/shorts/TbiwCzaNF38 · https://www.youtube.com/shorts/viiKXW6D-ls · https://www.youtube.com/watch?v=CVQm9a_RMT4 (11:46) · https://www.youtube.com/watch?v=sOQabPjvfRY (5:48)
- **Daniel Fazio.** Shorts are a full-frame single speaker at a whiteboard, with 2-3-word captions and a small pill graphic under the caption for the key phrase or number ("$100,000 a month from one client"). Long-form is a single camera with small red pill callouts and no burned captions. Copy: single-face Shorts, a number shown only when spoken. https://www.youtube.com/shorts/0O-qWYbLVek · https://www.youtube.com/shorts/GHPYhMzno6Q · https://www.youtube.com/watch?v=kF3m7zTU3rk (5:16) · https://www.youtube.com/watch?v=CYNtdl8E2K0 (11:27)
- **Cold Email Chris.** Split only to show a document or tool: screen on top, face on the bottom, caption pill at the seam. Copy: the main-channel demo layout. https://www.youtube.com/shorts/jQkpuMIE-yM · https://www.youtube.com/shorts/yf2-2Gq4lA4
- **Lead Gen Jay.** Single full-frame face, small sentence-case captions in the lower third, and a short top headline with one highlighted word early in the clip. Copy: one short headline, then get out of the way. https://www.youtube.com/shorts/aC7JoPtAQa8 · https://www.youtube.com/shorts/xTUDslkXXPs
- **Nick Abraham.** Screen on top and webcam face on the bottom for walkthroughs; all-caps captions with one highlight colour. Copy: the same demo split. Skip: hashtag-stuffed titles. https://www.youtube.com/shorts/6ELJN5WiAtc · https://www.youtube.com/shorts/-CY-qCLDKZQ

None of the 5 creators show the same face twice. When they split, the second panel is always a screen.

## 7. Mistakes already seen in our clips (do not repeat)
- Same face twice, top and bottom, with a text box over it: P311241877Ez NERDGSjzfM and Gp5pYm4hfw; P3111218gcES Z6QYZxR83R; P3111218bZbQ VHfGIOkhtB (fixed in copy nH6jslj14ofF, which Alex approved).
- QR end card plus music tail: default on new renders (P311241877Ez NERDGSjzfM, TqRR5QdMQg; P3111218gcES Z6QYZxR83R).
- Caption and transcript errors: "Alex Wong" and "two thousand and 27" (P3112318QoRD); "Disco-like" (P3111218WoBy cKMdQmUYvM); "Smart Lead" (P3111218YLir JbY81OURBV).
- Slop metadata: "#Closing技巧" (TqRR5QdMQg); off-topic "#EventRentalBusiness" (iM0facmmBM) and "#CreatorMarketing #EcommerceMarketing" (fLwyIL47Iy); overstated titles ("Get 7x More Qualified Sales Meetings", "Create 100 Ad Creatives in 2 Days").
- Screen recordings too small to read in a split (P3111218YtWd aotsR6pqas).

## 8. Alex's decisions (2026-11-25; these win over anything above)
1. **QR / "Learn more on our socials" end card: never.**
2. **Burned-in captions on long-form: only on Alex Woung Raw.** Main-channel long-form uses YouTube captions only (no burned-in text). Shorts/Reels always have burned-in captions.
3. **Raw:** cut the filler words (um, uh, false starts, retakes) and dead air over 1 s, but keep his natural pace (no jump-cut rhythm, normal pauses stay). `removeFiller: true`. Clips 30-90 s.
4. **Keyword highlight: off.**
5. **Caption look: like Nik Setting's videos** (clean, minimal, modern). Before the first edit Sienna studies a few of his recent Shorts and long-form for free (YouTube page, transcript, stills; no vidIQ) and writes the exact look here (case, size, position, font weight, motion). Until then: sentence case, white, subtle shadow, lower-middle, 1-4 words, no emoji.
6. **"Alex Woung" OpusClip template: yes.** OpusClip's tools can't create templates, so Sienna writes the exact settings and Alex (or Sienna in the app via Chrome) saves it once; until then she applies the settings per clip.
7. **No vidIQ** (Alex doesn't pay for it). Study creators from free pages, transcripts and stills.

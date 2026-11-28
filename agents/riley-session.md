# Riley: scheduled systems check (runbook)

Runs as a Claude scheduled task every 2 hours, 8 a.m. to 8 p.m. ET. Read `CLAUDE.md`, `rules/RULES.md`, `skills/riley-systems-repair/SKILL.md` (and its references) and `rules/build-error-playbook.md` first.

**Autonomy (Alex, 2026-11-25):** Riley explains why, **prepares** the fix, and waits for Alex's ✅ before anything goes live. This holds until Alex says Riley may fix freely. Read-only checks need no approval.

Where things are:
- **System Issues** table: `tblZvXQongRlV0vsl` in base `appxqINt5XKw7a76A`. The engine adds failed, stuck and needs-review engine jobs (and n8n errors when it has a key) every 15 minutes.
- **Decisions** table: `tbldkqPZFBxeEVqg3`. A row with Status New is posted to Slack by the engine. ✅ runs its Action.
  - Field IDs: Title `fldxt2f4sQhBHje9E`, Agent `fld165gTuw6x42nUz`, Status `fldtrMYNj5kHZgtf2`, Client `fld56YtMn1GufxyOe`, Issue `fld0OlnGJ5FFEDCok`, Checked `fldxArl8q8r43fq6l`, Fix `fldNtMhO2GYWd7abK`, Details `fldqoWVHJsnDSCuZU`, Action `fldF1Mzz8TG8SKv82`, Action Input `fldoFEqnb3EOLrCr6`.
  - Write select values by name with typecast on.

## Each run, in this order

### 1. Make approved fixes live
Issues with Status **Approved** (Alex ✅'d). The engine already did two kinds itself: a **Retry** was re-run, and an **n8n change** with an `n8nPatch` was applied (those come back as **Applied**, with the result and the rollback line on the issue; just verify them below).
- **Code PR** (Alex 2026-11-27: Riley finishes code fixes himself after the ✅):
  1. open the PR from the prepared `claude/riley-<short-name>` branch to `main`;
  2. run the tests on it: `cd engine && npm ci && npx tsc -p tsconfig.json`, then the test suite (`engine/README.md`; it needs a Postgres via `TEST_DATABASE_URL`, start one if the session can). If anything fails, don't merge: Status **Fix failed** with what failed;
  3. merge it to `main`;
  4. Slack DM Alex (user `U070Z26377C`) exactly this one line:
     ```
     Fixed: <title>. Please deploy: `cd /opt/dulcy-os && git pull && bash engine/deploy/deploy.sh`
     ```
  5. Status **Applied**, with the PR link in Fix Ref.
  - **If the push or the PR is refused** (the repo isn't attached to this scheduled task): say so **once** in the Slack report ("Can't push: the repo isn't attached to my scheduled task. Branch ready: <name>"), keep the issue **Approved**, and don't repeat it on later runs until it changes.
- **n8n change:**
  - With an `n8nPatch` the engine applied it on the ✅ (Status **Applied**). If the engine stopped instead, the issue says why:
    - **New** + "changed since diagnosis": the workflow was edited after you read it. Diagnose it again (step 3), write a new patch and post a new Decision (the old one is closed).
    - **Fix failed** + "refused": the patch touched a credential/key/token/password/auth value. Those stay **Manual (Alex)**.
    - **Approved** + "n8n apply is off" or "no N8N_API_KEY": the engine checked but changed nothing. Post Alex the exact steps (workflow, node, field, old → new) and set **Applied** once he confirms.
  - Without an `n8nPatch` (old issues): post Alex the exact steps as above.
- **Make change / Airtable change:** apply exactly the prepared change with the Make / Airtable tools. Keep the saved previous version (the Rollback).
- **Config:** post Alex the exact line to change on the server. Never ask him to paste secrets in chat.
- **Verify every fix:** a real run or execution, or the next engine job of that kind succeeding.
  - Worked: Status **Fixed**, with the evidence in Result.
  - Didn't: Status **Fix failed** with what happened, then go back to step 3 for it.

### 2. Close rejected ones
Issue in **Waiting for Alex** and its Decision is **Rejected**: set the issue to **Rejected**.

### 3. Diagnose every New issue (the engine's and your own)
1. **Read the evidence:**
   - the error and Details JSON;
   - engine code in `engine/src`;
   - n8n workflow details, Make execution details, Airtable automation runs;
   - recent similar issues.
   Never guess.
2. **Decide:**
   - **Expected or not a system fault** (bad input from a button press, a client-side wait): Status **Ignored**, with the reason in Why. No Slack.
   - **Transient** (timeout, rate limit, 5xx, overloaded) and re-running costs nothing new: Fix Type **Retry**.
   - **Bug in engine code:**
     - make the smallest fix on a new branch `claude/riley-<short-name>`, plus a test;
     - run `npx tsc` and the tests you can;
     - commit and push the branch (no PR yet, never merge before the ✅);
     - Fix Type **Code PR**, with the branch name in Fix Ref. On ✅ step 1 opens the PR, tests, merges and pings Alex to deploy.
   - **n8n problem (a node's parameters):** write the exact patch; the engine applies it on Alex's ✅ (see "n8n patches" below). No "your hands" for n8n parameter changes. Fix Type **n8n change**.
   - **Make / Airtable problem:** write the exact change (where, old → new) and the Rollback. Fix Type to match.
   - **Needs a business decision or Alex's hands** (a key expired, a payment failed): Fix Type **Manual (Alex)**, with exact steps.
3. **Fill in Why, Fix and Rollback** in plain words. Why = the root cause, with evidence. Fix = what changes, the risk, and how it is tested.
4. **Create the Decision:**
   - Title "Riley: <short title>", Agent "Riley", Status "New", Client "Dulcy (systems)".
   - Issue = Why in 1-2 lines. Checked = the evidence. Fix = the prepared fix.
   - Details = issue record ID, job/execution IDs, PR link.
   - Action "Apply Riley Fix", Action Input `{"issueId":"<System Issues record ID>"}`. Manual fixes take Action "None".
   - Then set the issue Status to **Waiting for Alex** and save the Decision record ID on it.
   - **One Decision per issue.** Never post the same issue twice; Occurrences counts repeats.

### 4. Sweep (first run of the day only, the 8 a.m. run)
- **Make:** error executions in the last 24 hours on active scenarios.
- **Airtable:** failed automation runs in the last 24 hours.
- **n8n:** only if the engine isn't already logging n8n errors (no n8n rows in 3 days). Check the workflows behind live flows with the n8n tools.
- **Add each problem** as a System Issues row: Source Make / Airtable / n8n, Status New, Signature `<source>:<where>:<error pattern>`. If the signature already exists, raise Occurrences instead. Then diagnose it as in step 3.

### 5. Known open issues (first run of the day, one at a time)
- **When:** only if no Source "Known issue" row is in **Waiting for Alex**.
- **What:** take the next one from "Known open issues" in `skills/riley-systems-repair/SKILL.md` (and `automations/*/FINDINGS*`), open a System Issues row (Source Known issue), prepare the fix and post the Decision.
- **Order:**
  1. anything that loses data or replies (the Make reply webhook queue near its limit);
  2. broken live flows (Booked Meeting);
  3. security (keys hardcoded in n8n/Airtable scripts, webhooks with no auth).

### 6. Report
- **When to post:** only when something is new for Alex: a fix made live, a fix that failed, or a manual step only he can do. Post a short DM to Alex in Slack (U070Z26377C, or channel C0B581HNSMR if the DM fails). Decisions already post themselves, so don't repeat them. Otherwise stay quiet.
- **Format:**
  ```
  *Riley · <time>*
  Fixed: <n> (<titles>) · Waiting on you: <n> · Needs your hands: <steps>
  ```

## Hard rules
- **Nothing goes live without Alex's ✅**: no merge, workflow edit, activation, deactivation, replay, queue clear or config change. (The engine applies an `n8nPatch` only on the ✅.)
- **Never act on anything** that sends, spends credits, launches, deletes, or changes client-facing records. Riley fixes plumbing only.
- **Never read, show or commit keys or passwords.** Repo copies stay scrubbed.
- **Small steps.** One issue, one fix, one Decision.
- **New error patterns** go into `rules/build-error-playbook.md`. Update the repo snapshot of anything changed (`automations/`, `airtable/automations/`).
- **Commits:** on `claude/riley-*` branches only. No model names in commits.

## n8n patches (Alex 2026-11-27: Riley fixes n8n end to end after the ✅)
Your n8n connector only reads; the engine on the server has the n8n key and makes the change when Alex presses ✅.
1. Read the live workflow with the n8n MCP tool **get_workflow_details** (never the repo snapshot). Copy the node **name** and the current value exactly.
2. Write the patch into the issue's **Details** JSON under `n8nPatch` (keep the other keys in Details):
   ```json
   {"n8nPatch": {"workflowId": "xcteI9ofNLOqC0GO", "changes": [
     {"node": "Check Results", "path": "rule.interval.0.minutesInterval", "old": 1, "new": 30},
     {"node": "Schedule next approval-required follow-up", "path": "$disabled", "old": false, "new": true}
   ]}}
   ```
   - `path` is inside the node's `parameters`, dots between keys, numbers for list positions (`rule.interval.0.minutesInterval`). `"$disabled"` switches a whole node off (`true`) or on (`false`).
   - `old` = exactly what get_workflow_details shows now (`null` if the parameter is absent). The engine stops if it no longer matches ("changed since diagnosis").
   - `new` = the value to set (`null` removes it). Whole objects and lists are fine (e.g. a Code node's full `jsCode`).
   - **Text edit inside a long string** (e.g. one line of a Code node's `jsCode`): use `{"node": "...", "path": "jsCode", "find": "<exact text>", "replace": "<new text>"}` instead of old/new. `find` must appear exactly once in the live value, else the engine stops ("no longer there" / "appears N times"). Prefer this for Code nodes: copying a whole script exactly is fragile.
   - Parameters only: no new nodes, no new connections. If the fix needs those, use **Manual (Alex)** with click-by-click steps.
   - **Never** a credential, key, token, password or auth setting (paths like `authentication`, `apiKey`, a header named `Authorization`): the engine refuses them. Those are **Manual (Alex)**.
3. Put the same change in plain words in **Fix** (node › field: old → new, the risk) and the human Rollback in **Rollback**. On ✅ the engine saves the full previous workflow and adds the rollback line itself (`riley-n8n-rollback <issueId> --yes` on the server).
4. Verify on a later run (step 1): the next execution of that workflow succeeds → **Fixed**.

## Reading n8n runs (Alex 2026-11-27)
- For n8n issues, the engine attaches what came into the failed run to the issue's **Details** as `input` (ids, masked emails, the failing `node`), every sweep, using the server's `N8N_API_KEY`. Read it there.
- **Never ask Alex to open an n8n execution** to find a lead or a value. If `input` is missing, say so in the card ("engine has no n8n key" or "run older than 7 days") and diagnose from the workflow and Airtable instead.
- "Manual (Alex)" is only for things no tool can do (credentials, adding nodes or connections, a key that expired); then give exact click-by-click steps. n8n parameter changes go through an `n8nPatch`, not Alex's hands.

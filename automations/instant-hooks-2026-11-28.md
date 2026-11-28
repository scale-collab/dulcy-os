# Instant hooks: the n8n, Make and Airtable changes (2026-11-28)

**Why:** Alex (2026-11-28): "I don't want any agents to run on schedules; it should be an instant webhook type of thing." The engine now has `POST https://engine.dulcy.io/hooks/<source>` (code: `engine/src/instant/`). The systems below must call it when work arrives. Full picture, server secrets and the provider steps (EmailBison, Slack, Fathom, Close): `engine/GUIDE.md` → "Agents start instantly (engine)".

**Status:** NOT applied. Nothing live was changed by Claude. Alex (or Riley after Alex's ✅) makes each change in the n8n editor, Make and Airtable. None of these changes can be an `n8nPatch` (Riley's engine-applied fix): every one **adds** a node or connection, and `n8nPatch` only changes values of nodes that already exist. Each is click-steps.

**Safety:** every call below only tells the engine "work arrived". It carries no lead data (a workspace id at most) and cannot send, launch or buy anything. Each HTTP node is set to **On Error → Continue**, so if the engine is down or answers 404 (secret not set yet) the workflow carries on exactly as today.

**Secrets:** the shared secrets are made on the server (GUIDE step 1) and pasted only into n8n's credential store, Make's connection/header field and Airtable's script Secrets panel. Never in a node's text, a script's text, this repo or chat.

Check after each change: on the server `docker compose exec engine node dist/src/cli.js hooks` shows the event under "last 10".

---

## n8n (`HOOK_SECRET_N8N`)

### 0. One credential (once)
n8n → **Credentials** → **Add credential** → **Header Auth**
- Credential name: `Dulcy engine hook`
- Name: `x-hook-secret`
- Value: the value of `HOOK_SECRET_N8N` (GUIDE step 1)

### The node (copy, then paste into the editor with Ctrl/Cmd+V)
Change only `"name"` and the `"event"` value per place below. After pasting, open the node once and pick the `Dulcy engine hook` credential (n8n does not paste credential links).

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://engine.dulcy.io/hooks/n8n",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\"event\":\"reply\"}",
        "options": { "timeout": 10000 }
      },
      "name": "Tell engine: reply",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [0, 0],
      "onError": "continueRegularOutput",
      "alwaysOutputData": true
    }
  ]
}
```

### 2a. Replies → Echo (`{"event":"reply"}`)
Echo reads the Emails row, so the call goes **after** the row is written. In each workflow: paste the node once, then drag a connection from **every** node listed to it (one node, many inputs is fine; n8n runs it once per arriving item, and the engine makes a burst one run).

| Workflow (ID) | Connect from (Emails row created) |
|---|---|
| [INBOX MANAGER] Receive Replies from EmailBison (`NwlemmcwCZLCXAmt`) | `Create a record`, `Create a record1`, `Create a record2`, `Create a record3`, `Create a record4`, `Create a record5` |
| [INBOX MANAGER] Bison Untracked Replies (`40Eey0ohIWGjjEwp`) | `Create Lead + Response - Interested`, `… - not interested`, `… - OOO`, `… - not sure` |
| [INBOX MANAGER] Receive Replies + Handwrytten Direct Mail (`4xyu4gVL6gKjEHLW`) | `Create a record` … `Create a record5` |
| [INBOX MANAGER] Receive Replies from HeyReach (`N701JraB7XoAiDfshPs8T`) | `Create a record`, `Create a record1`, `Create a record2` |
| 1.2 Positive Email Reply (`QVK0WeDOVcpJLavy`) | `Update record` (runs after both the create and the update path) |
| [INBOX MANAGER] Manually Mark Reply as Interested - EmailBison (`bPc1ANniCluNn0tP`) | `Create a record`, `Create a record4`, `Create a record5` |

Node names are from the 2026-11-17 snapshot (`automations/n8n-live-2026-11-17/workflows/`); if a node was renamed since, pick the Airtable node that **creates** in the Emails table (`tblADFhWhTcLrl1UY`). Which of these workflows Alex still uses: UNKNOWN (Riley can confirm from the n8n execution list).

### 2b. Placement results → account health (`{"event":"placement_results"}`)
`[Inbox Placement Tests] Check Results` (`xcteI9ofNLOqC0GO`): paste the node named `Tell engine: placement results` and connect it from `Update record` (the last write, after `Merge Inbox Placement Health`).

### 2c. n8n errors → Riley (`{"event":"error", …}`)
1. New workflow **Dulcy engine: errors to Riley**.
2. Add node **Error Trigger**.
3. Paste the HTTP node, name it `Tell engine: error`, connect it from the Error Trigger, and set its JSON body to (expression mode):
   ```
   {{ JSON.stringify({ event: 'error', workflow: $json.workflow.name, execution: String($json.execution.id ?? ''), error: String($json.execution.error?.message ?? '').slice(0, 1000), executionUrl: $json.execution.url ?? '' }) }}
   ```
4. Save and **Activate**.
5. In each active workflow: **⋯ → Settings → Error workflow** → `Dulcy engine: errors to Riley` → Save. (Riley's `riley.collect` still reads n8n's own error list when `N8N_API_KEY` is set; the webhook makes it start at once.)

### 2d. Bounces → the bounce check of that workspace (`{"event":"bounce", …}`)
`[Inbox Management] Bounce Data Tracker` (`nioXwxwNYsuBbHIOouCuW`): paste the node, name it `Tell engine: bounce`, connect it from both `Create a record` and `Update record`, JSON body (expression mode):
```
{{ JSON.stringify({ event: 'bounce', workspace_id: $('Webhook').item.json.body?.event?.workspace_id ?? null, workspace_name: $('Webhook').item.json.body?.event?.workspace_name ?? '' }) }}
```
EmailBison puts the workspace in `body.event.workspace_id` / `workspace_name`; if the Webhook node's output shows it elsewhere, point the expression there. Without a workspace id the engine checks every workspace once (still one run per burst).

### 2e. Manual sends → Echo's follow-ups (`{"event":"sent"}`)
`Manual Emails Sent (Including Dulcy Reply Agent)` (`ewcunE4ck0jS6IZh`): paste the node, name it `Tell engine: sent`, connect it from `Update record1`.

---

## Make (`HOOK_SECRET_MAKE`)

Make has no account-wide error webhook, so this is per scenario (start with the ON scenarios in `automations/make-2026-11-17/INDEX.md` that write Airtable or send). In each:
1. Right-click the module that most often fails (or each Airtable/HTTP module) → **Add error handler**.
2. Add **HTTP → Make a request**:
   - URL `https://engine.dulcy.io/hooks/make`, Method `POST`
   - Headers: `x-hook-secret` = the value of `HOOK_SECRET_MAKE` (Make keeps it in the scenario; never in a note or the repo), `content-type` = `application/json`
   - Body type Raw, content type JSON, request content:
     ```
     {"event":"error","scenario":"{{scenario.name}}","execution":"{{executionId}}","error":"{{error.message}}"}
     ```
3. After the HTTP module add **Resume** or **Ignore** only if the scenario used to stop there and that is still wanted; otherwise **Break** keeps today's behaviour (Make stores the incomplete run).
Make errors land in System Issues through `riley.collect` (source Make). Riley's session still sweeps Make runs.

---

## Airtable (`HOOK_SECRET_AIRTABLE`)

Base `appxqINt5XKw7a76A`. Seven automations, same action each: **Run a script**. The script (identical in all seven; only the `event` input changes):

```js
// Tell the Dulcy engine that work arrived (no data but the record id).
const { event, recordId } = input.config();
const res = await fetch('https://engine.dulcy.io/hooks/airtable', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hook-secret': input.secret('engineHookSecret') },
  body: JSON.stringify({ event, recordId }),
});
if (!res.ok) console.log(`engine answered ${res.status}`); // never fails the automation
```
- Script **Secrets** panel (left side of the script editor): add `engineHookSecret` = the value of `HOOK_SECRET_AIRTABLE`. If the plan shows no Secrets panel: UNKNOWN whether it is available on this plan; then add it as an input variable instead (it stays inside Airtable, never in the script text or the repo) and change the line to `input.config().secret`.
- Input variables: `event` (type the text below) and `recordId` = the trigger record's **Airtable record ID**.

| # | Name | Trigger | `event` |
|---|---|---|---|
| 1 | Engine: Lead List button | **When a record matches conditions**, Lead Lists (`tblVOg9BkPOMmnitt`): `Runs on Engine` (`fldKPpOJP097SYrhS`) is checked AND `Engine Action` (`fldZgT9Rbnra2x5GP`) is not empty | `engine_action` |
| 2 | Engine: Campaign button | **When a record matches conditions**, Campaigns (`tblAVAA6uBPaMj28P`): `Runs on Engine` (`flds0oKDXF1XgQUeI`) is checked AND `Engine Action` (`fldsvWSdSkH8y16wW`) is not empty | `engine_action` |
| 3 | Engine: decision approved by hand | **When a record matches conditions**, Decisions (`tbldkqPZFBxeEVqg3`): `Status` is `Approved` | `decision` |
| 4 | Engine: Reply Queue button | **When a record is updated**, Emails (`tblADFhWhTcLrl1UY`), field `Dulcy Reply Agent Human Action` (`fldvdJBtL4ez5lbjN`) | `reply_action` |
| 5 | Engine: idea approved | **When a record matches conditions**, Content (`tblcSzvicm3wivvhh`): `Idea Decision` (`fld3M7y7fHCbahSxD`) is `Approved` | `idea_approved` |
| 6 | Engine: campaign changed | **When a record is updated**, Campaigns (`tblAVAA6uBPaMj28P`), fields `Status`, `Campaign Workflow` (`fldOVJmlGWxW1dveo`) and the progress field (`fldGM1f8fNNu6ODo2`) | `campaign_changed` |
| 7 | Engine: placement results | **When a record is created**, Inbox Placement Testing (`tblGjv6A5r7md3kxX`) | `placement_results` |

Notes:
- A "matches conditions" trigger fires once when the record starts matching, which is exactly a button press or an approval. Automation 6 fires on every progress write (the bounce check writes numbers); the engine makes a burst one run, so that is fine.
- An HQ button or approval does not need these (HQ starts the work itself); they are for presses made in Airtable.
- Turn each automation **On**. Airtable allows 50 automations per base; this adds 7 (count today: UNKNOWN, check Automations → the list).
- Do these **before** the engine restart that loads `HOOK_SECRET_AIRTABLE` (GUIDE step 8, then 9): from that restart on, the 30-second poll stops and the buttons are picked up through these automations (plus the 6-hour backup sweep).

## Rollback
Each change is additive: delete the HTTP node / the error handler / the automation, and remove that source's `HOOK_SECRET_<SOURCE>` line from the server `.env` and restart. The jobs it fed go back to their old timer by themselves.

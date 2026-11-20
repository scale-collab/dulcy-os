# n8n patch: send only useful client fields to the AI (filter generation)

**Why:** the live filter step ("Prepare AI Keyword Review2", workflow T_KveEbSPrwKFWz2neZ6k) builds the AI prompt from the client's whole Workspace IDs record (up to 60 fields). Its skip list does not exclude the EmailBison API, EmailGuard API or HeyReach Workspace API fields, so those can reach OpenAI. Alex (2026-11-20): send only what is useful.

**Who:** Alex or Riley, in the n8n editor. (The n8n tool Claude has cannot edit workflows.)

## Steps
1. Open workflow `T_KveEbSPrwKFWz2neZ6k`, Code node **Prepare AI Keyword Review2**.
2. Find this line (it starts with `const clientEntries=`):

```js
const clientEntries=Object.entries(clientFields).map(([key,value])=>[key,flattenClient(value)]).filter(([key,value])=>value&&!operationalField.test(key)&&!/^rec[A-Za-z0-9]+$/.test(value)&&!/^https?:\/\//i.test(value)).slice(0,60);
```

3. Replace it with these two lines:

```js
const USEFUL_CLIENT_FIELDS=['Name','Brand Name','Client Type','Cold Traffic Offer','Front End Offer(s)','Back End Offer(s)','Outbound Risk Reversal','Sender Title'];
const clientEntries=USEFUL_CLIENT_FIELDS.map(key=>[key,flattenClient(clientFields[key])]).filter(([,value])=>value&&!/^rec[A-Za-z0-9]+$/.test(value)&&!/^https?:\/\//i.test(value));
```

4. Save. Test once with "Generate Filters" on a test list; the plan should look the same as before.

The engine uses the same 8 fields (`engine/src/airtable/bridge.ts`, `FILTER_CLIENT_FIELDS`).

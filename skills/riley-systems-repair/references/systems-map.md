# Dulcy Systems Map

## Core operating systems

### Airtable
Use for operational state, workflow records, approvals, client/campaign metadata, lead-list records, counters, statuses, and cross-functional views.

### Email Bison
Use for outbound execution: campaigns, sender emails, sending activity, replies, leads, and campaign-level outbound data.

### Google Drive / Sheets
Use for working documents, shared client material, lead-list processing sheets, exports/imports, and collaboration files.

### Slack
Use for alerts, handoffs, approvals, team/client communication. Do not rely on Slack as the authoritative operational database.

### Calendar / Calendly
Use for scheduling, booked-call events, attendee details, and meeting timing.

### Enrichment / verification
DiscoLike, LeadMagic, MillionVerifier and similar tools are processing layers. Preserve source IDs and write verified outcomes back to the proper operational record.

### EmailGuard
Use for spam/deliverability checks and inbox-placement related workflows where available.

### Xero / finance tools
Use as the accounting source of truth. Airtable operations may move data or trigger reports; Jarvis business-finance module owns financial interpretation.

### HeyReach / LinkedIn tooling
Use for LinkedIn follow-up and supporting multi-channel sequences where approved.

## Identity rules

Never mix IDs across object types.

Common examples:
- Airtable record ID: `rec...`
- Email Bison workspace ID: workspace-level identifier
- Email Bison sender-email ID: sender record identifier
- campaign ID: campaign-specific identifier
- lead ID: lead-specific identifier

When unsure, GET the resource and inspect the object whose endpoint you intend to update.

## Data ownership decision

For every field ask:
1. Which system creates it?
2. Which system is authoritative?
3. Which systems receive a copy?
4. What happens if copies disagree?

Default to one source of truth per field/object whenever possible.

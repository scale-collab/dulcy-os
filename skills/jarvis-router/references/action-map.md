# Jarvis Action and Connector Map

Use this file when the user wants Jarvis to do something in an external system, not merely advise.

## General action policy

1. Separate read/analysis from write/execution.
2. Prefer connected tools over manual instructions when an appropriate connector is available.
3. Use the specialist skill for domain reasoning, then the connector/tool for execution.
4. Preserve connector confirmation rules and platform permissions.
5. Never claim success unless the tool confirms success.
6. For actions involving money, legal commitments, destructive changes, employment termination, or live campaign changes, make the exact pending action clear before execution when confirmation is required.

## Current connector families

### Communication and scheduling
- Gmail: search/read email, draft/send mail, labels, archive/trash when requested.
- Google Calendar: search schedule, check availability, create/update/delete events, RSVP.
- Google Contacts: resolve people and contact details for email/calendar workflows.
- Slack: search/read workspace context and take supported collaboration actions.
- Calendly: scheduling links, event types, availability, bookings/cancellations when relevant.

### Files and knowledge
- Google Drive: search/read/work with Drive, Docs, Sheets, and Slides.
- Notion: search docs, create/update documentation/tasks when relevant.
- Files/Library: retrieve user-provided files and persistent artifacts.

### Business operations
- Airtable: search/create/update operational records when relevant.
- Close / HighLevel: CRM operations if the user chooses those systems.
- Fathom: meeting summaries/transcripts/action items.
- PandaDoc: agreement drafting and signature workflows when requested.

### Travel and local services
- Expedia / Hilton / Tripadvisor: travel research and booking-related discovery.
- Uber: ride price and ETA estimates.
- Uber Eats: restaurant/dish discovery.

### Shopping / vehicles / housing
- Walmart: shopping when appropriate.
- Autotrader / CARFAX: vehicle research.
- Realtor.com / Redfin / Zillow: real-estate research.

## Specialist-to-tool examples

- Jarvis -> Jarvis planning/admin module -> Google Calendar: schedule an appointment or block time.
- Jarvis -> Jarvis planning/admin module -> Gmail: send or draft a personal administrative email.
- Jarvis -> Atlas client success -> Slack/Gmail: prepare or send a client update.
- Jarvis -> Jarvis hiring module -> Google Calendar/Gmail: coordinate interviews after the hiring decision/process is defined.
- Jarvis -> Airtable operations -> Airtable/Slack/Drive: perform supported operations in the workflow after Airtable operations determines the correct data/action.
- Jarvis -> Jarvis travel module -> Expedia/Hilton/Tripadvisor/Uber: research trip options and execute supported booking/logistics actions with required confirmations.
- Jarvis -> Jarvis transportation module -> Autotrader/CARFAX: research vehicles.
- Jarvis -> Jarvis shopping module -> Walmart: research/order supported products subject to purchase confirmation rules.

## Brokerage / investing

Use the personal-finance module for general planning, explicitly load Red Dog (`sterling`) for active trade-risk plans, and use authenticated data for the actual portfolio. Read-only analysis does not authorize an order. Financial trades, transfers and other highly consequential financial actions require user handoff under the active confirmation policy; chat approval alone does not authorize the assistant to submit them. Never substitute web estimates for authenticated holdings or claim an order was placed without execution evidence.

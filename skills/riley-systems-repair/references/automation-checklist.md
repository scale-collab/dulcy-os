# Automation Build & Review Checklist

## Before building

- Define the business outcome.
- Confirm the manual process works.
- Identify the source of truth.
- Identify exact object IDs needed.
- List required fields and types.
- Decide whether the workflow is one item, many items, or paginated data.

## Logic review

- What does blank mean?
- What does zero mean?
- Can the same record trigger twice?
- Can one step succeed while a later step fails?
- Are retries safe?
- Does the workflow need a lock/status flag?
- Is a human approval required before an irreversible action?

## n8n / Make

- Inspect actual node output JSON.
- Confirm expression paths with live data.
- Confirm arrays versus items.
- Confirm iterator/loop behavior.
- Confirm merges preserve the correct item pairing.
- Cast numbers explicitly before arithmetic.
- Avoid hidden assumptions about `item` context.

## API

- Endpoint correct.
- Method correct.
- Auth correct.
- ID type correct.
- Body schema correct.
- Field type correct.
- Pagination handled.
- Rate limits considered.
- Error body logged.

## Airtable

- Record ID versus field value is explicit.
- Linked-record fields use expected format.
- Formula output is understood.
- Numeric fields never receive NaN.
- Updates happen only after prerequisite actions succeed.

## Slack

- App has access to channel.
- Private-channel membership verified.
- Alert includes enough context to act.
- Alert is not the only record of a state change.

## Reliability

- Add status fields when helpful: queued, processing, completed, failed.
- Store external IDs after creation.
- Make create actions idempotent where possible.
- Log the last successful step.
- Make failure visible to a human.
- Define how to rerun safely.

## Testing

Test at least:
1. normal record
2. blank optional field
3. zero numeric field
4. missing required field
5. duplicate trigger
6. multiple-item input
7. API failure
8. permission failure where relevant

## Definition of done

A workflow is done only when:
- the happy path works
- expected edge cases are handled
- outputs are written to the intended source of truth
- failures are visible
- a rerun will not corrupt state
- another operator can understand the workflow

# Dulcy Finance Model Reference

## Classification Rules

### Cash
Money actually available in bank/investment cash accounts. Do not include unpaid invoices, pipeline, or future subscriptions.

### Cash collected
Payments actually captured/received during the requested period, net or gross only as explicitly labeled. If processor fees are deducted before settlement, report gross collections and fees separately when available.

### Revenue
Use the accounting basis represented by Xero or the user's requested basis. Do not substitute Stripe collections for recognized revenue without saying so.

### Accounts receivable
Amounts invoiced/earned but not yet collected according to the accounting or invoicing system.

### Contracted value / MRR
Committed commercial value. It is not cash until collected and not necessarily recognized revenue yet.

### Pipeline
Potential future sales value. Keep completely separate from revenue and cash.

### Gross profit
Revenue minus directly attributable cost of fulfillment.

### Gross margin
Gross profit / revenue.

### Operating profit
Revenue minus direct costs and operating expenses for the period, using the accounting records available.

## Reconciliation Logic

When Stripe, Mercury, and Xero disagree, check timing before assuming an error:
1. processor capture date
2. settlement date
3. bank deposit date
4. refund/dispute timing
5. processor fee treatment
6. accounting recognition/categorization date

Return unresolved differences as exceptions.

## Forecasting Logic

### EOM cash baseline
Current cash
+ committed collections expected before month end
- committed expenses expected before month end
= committed EOM cash

Then optionally layer expected but uncertain items separately.

### Runway
If requested and meaningful:
Cash available / average monthly net cash burn.

Do not calculate runway from a single unusually high/low month unless the user explicitly requests it. Prefer a recent multi-month average when available.

## Commercial Models

### Direct client
Track client revenue, direct fulfillment cost, commissions/fees if attributable, and gross margin.

### White-label
Track wholesale revenue received by Dulcy separately from the partner's retail price unless Dulcy actually recognizes the retail amount.

### Affiliate
Track commission expense or commission payable separately from client revenue.

### Embedded partner
Treat according to the underlying contract/payment structure; "embedded" alone does not define accounting treatment.

## Decision Rules

Flag for attention when supported by data:
- cash is declining while recognized revenue is stable/growing
- collections trail invoicing materially
- failed payments or disputes are rising
- direct fulfillment costs are growing faster than client revenue
- a service/package has weak or negative contribution economics
- upcoming committed obligations exceed high-confidence inflows
- unexplained processor-to-bank or bank-to-Xero differences persist

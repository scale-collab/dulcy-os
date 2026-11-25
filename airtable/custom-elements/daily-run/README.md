# Daily Run (custom element)

- Interface: Project Management (`pbd7Rqnax71GwN6Wh`), page `pag4oy80YbYDAOj4C`, block `blk5lFNbkRRBFd7gF` (built 2026-11-25).
- Tables: Decisions `tbldkqPZFBxeEVqg3` (primary), Tasks `tblRBxm2N53331mIm`, Emails `tblADFhWhTcLrl1UY` (Dulcy Reply Agent Human Action `fldvdJBtL4ez5lbjN` only).
- Writes: Decisions Status (Approved/Rejected), Decided By, Decided At; for "Approve Reply" decisions also Emails Human Action (Approve Draft / Skip) so the engine's reply sender sends exactly once; Tasks Status = Done on Complete.
- Piles by Agent: Sean = Replies; Atlas/Scribe/Scout = Campaigns; Riley = Fixes; Ledger = Money; the rest = Other. Pending = Status New or Waiting.
- The engine's decisions loop runs approved actions exactly as it does for a Slack ✅.
- Source: read it from Airtable with `describe_custom_element` (block above) before changing it.

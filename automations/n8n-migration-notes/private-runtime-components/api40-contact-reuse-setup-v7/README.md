# Closed setup for current company snapshot reuse

This fixed setup adds three column privileges to the no-login backend owner:
UPDATE(run_id) on source_page and source_company_row, plus INSERT(sealed) on
source_run. The first two let the exact current helper take shared row locks.
The third lets it create the proved sealed copy in one statement. Existing
rights already cover the other 24 required insert columns. There is no new
runtime raw access, table-wide UPDATE or INSERT, role, connection, business
row change, source-function replacement or job.

The caller separately pins the component and supplies trusted database and
role names. The API release and principal must be off, its source helper must
match, and the runtime must have no active database session. Loading the
module returns a plan; it executes no SQL. The frozen core and host stay exact.
This is reviewed for isolated fake tests. Production installation and complete
standalone permission/restore checks remain open.

[PostgreSQL 16 row-lock privilege rule](https://www.postgresql.org/docs/16/sql-select.html)

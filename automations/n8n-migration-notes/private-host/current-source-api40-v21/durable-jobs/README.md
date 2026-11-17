# Durable work journal V1 — off by default

This own journal saves an event UUID and exact source-validated request text
before a worker runs it. Retrying the same UUID must use the exact same path,
record and text bytes. A new deliberate action needs a new persisted UUID.
There is no content-derived ID and no guess that two matching bodies are the
same action. Authentication headers and credentials never belong in this DTO.

The native queue issues leases, renews them, saves immutable attempt outcomes,
and returns due work. An expired lease may be reclaimed; late workers cannot
advance it. Only one job per record can be leased across this journal. Other
records can proceed. A committed ACK can be read again using the identical
attempt/outcome without changing later progress. Scope/worker/build/actual
login and original backend release remain authoritative. Held jobs require an
explicit expected-outcome proof to requeue; request bytes and checkpoint stay.
Business controllers must reconcile their own saved state before any effect.

The schema is separate from the immutable API28 core. Runtime receives one
fixed own-function command and no raw table, CREATE or TEMP access. A separate
NOLOGIN owner owns only these four tables/functions and reads selected backend
release metadata. This journal does not invoke a business function, approve a
sample, choose a provider mode or claim a list passed QA. Journal completion
means one work intent finished; it is not proof the whole lead list is Ready.

prepare.mjs emits a reviewable fresh-schema-only transaction. It opens no
connection, creates no role, and leaves its own release off with zero scopes.
It refuses target/role drift, an existing own schema, another database session
and an owner with business table rights. Scope/release enrollment, the full
base installer, producer/UI contract and actual host supervisor are separate.
No listener, timer, real service, live job or deployment is installed here.

store.mjs accepts only its one fixed SQL command. Payloads and native replies
are checked, including exact request hashing and lease identity. It cannot
send raw SQL through the old63-command compiler. A validated request text is
immutable input data, never a business-stage factory or executable program.
All eight source paths can be registered; an unfinished path must be held by
the future fixed supervisor and never silently treated as completed work.

This is an incomplete private component pending native/host integration proof.
The full13-action/8-path/11-mode replacement remains unfinished.

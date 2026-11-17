# Private pre-business release receipt

Default off. This additive component records a narrow release for an actual
three-attempt missing-company-approval hold after the separate error-status
writer has verified its one PATCH and both readbacks. It derives the writer,
request, source, own job/attempt and intake/dispatch/attempt from native rows.
The caller supplies only the original event ID; it cannot supply proof or rows.
All those rows stay unchanged. The receipt is append-only and repeated commit
returns that same receipt. Current native hashes must still match on every use.

Its separate slot predicate copies the original conditions and subtracts only
a currently valid receipt. The original predicate and queue-start functions
remain byte-exact. Thus the existing API39 queue is STILL BLOCKED: this is a
building block for a new closed queue version, not a working queue repair.
No successor intake, approval, run, provider retry, notice or business completion
is granted. A new approved user intent and new native ticket/source context still
need a genuine successor intake, plus end-to-end tests. No production install.

The setup requires the exact API39 base and status-component functions, both
disabled, and produces one separate schema with disabled release and no scopes.
Runtime receives schema USAGE and one typed step function only. Existing rows,
functions, raw grants and selectors are unchanged. No network is implemented.
Dependency checks cover direct status authority and original predicate bodies;
final all-transitive dependency/standalone/default-grant review remains open.

The effective existing slot predicate also checks paid-resume aliases. This
version preserves that OR condition literally and pins its wrapper, underlying
predicate and paid-alias function bodies. One backend-only SELECT grant for the
jobs release version/owner columns supports checking its separate typed owner.
Earlier V372 was refused in the setup transaction because it pinned the original
module name instead of the later renamed effective wrapper; no receipt installed.

The current paid alias clock also includes the latest issued source PATCH clock,
including an unknown reply. This version pins that effective-clock alias body
and its clock helper from the final frozen core extension, retaining both guards.
V374 was refused before installation because its alias pin preceded this override.

New API40/jobs4/error-v2 adapter. Internal receipt validation also requires its
release enabled and dependencies reviewed. Final dependency pins and manifest
are generated with the new host before tests; no previous proof is retagged.

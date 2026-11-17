**Private API40 test build:** A failed unapproved job can now be safely closed, then a new approved fake job can finish without changing the old failure. Two fresh repeats do no extra work; reopening the old job blocks it again. The new build stays OFF. [Checks and limits](docs/api40-successor-v456.md).

**Private entry-error status added:** Known missing-company-approval failures now get the exact saved failure status in local fake tests. One PATCH and two inert fresh replays preserve all prior work. The saved native reservation still blocks the next job; its safe release and later approval retry remain unfinished. The separate part stays off. `python3 scripts/check-next-build.py` checks340 offline cases. [Test and limits](docs/contact-entry-error-status-v369.md).

**Private button-request plan added:** Three current published Airtable scripts match the code for all13 accepted actions. A separate off planner adds the future worker auth and saved request-ID headers;17 checks plus the earlier304 checks run with `python3 scripts/check-next-build.py`. Live input/field wiring is still missing. A changed-company-rule sample completed and reopens inertly; missing approval holds without contact work, but its failure status still needs work. [Evidence and limits](docs/current-producer-and-guard-checks-v359.md).

# Dulcy lead worker

This is the private code copy of the Lead List Center workflow. It is still being built and tested. It has not been connected to real jobs or switched on.

The current development build in [development-build.json](private-runtime/development-build.json) uses API38 and the V18 host. Both stay off and unselected. The selected V13 compatibility host stays off and unchanged. The working n8n system stays in place.

Run the current offline code checks with:

```sh
python3 scripts/check-development-build.py
```

All280checks pass. Separate local database tests use fake service replies. The saved company/contact chain now reaches email checks, extra company facts, list QA, and linked campaign QA with a proper Review repair. A protected email edit is held; its safe release keeps the failed history and does not mark it passed.

- [New private contact-sample candidate and checks](docs/current-contact-sample-v345.md)
- [Selective recovery and fresh source gaps](docs/selective-recovery-and-source-gaps-v308.md)
- [Installed defaults and server checks](docs/installed-defaults-and-server-v299.md)
- [CSV and deep-review company samples](docs/company-sample-modes-v293.md)
- [Lost replies, a real stop and a second worker](docs/parent-worker-interruption-v289.md)
- [History-change holds and same-job recovery](docs/parent-history-change-recovery-v283.md)
- [Full parent-first Submit and Check test](docs/current-host-parent-history-v279.md)
- [Earlier off parent-first history candidate](docs/parent-history-v3.md)
- [Saved Skip Enrichment and QA handoff](docs/saved-ui-skip-enrichment.md)
- [Current host, QA repair and limits](docs/current-host-linked-qa-v260.md)
- [Earlier full-host enrichment/list QA](docs/current-host-enrichment-qa-v255.md)
- [Runtime map](docs/runtime-map.md)
- [Build history](docs/build-status.md)

The new off host passes the full fake parent-first verification Submit and Check path, including prior-lead exclusions and repeat clicks. Other parent-first paths and failure cases still need tests. Other modes, producer wiring, full error flow, clean setup, fresh source/database checks, server capacity/backups and release/rollback checks remain open. A live switch needs separate approval.

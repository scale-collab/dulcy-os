# dulcy-os

Private memory for Dulcy. Start with `CLAUDE.md`.

- `rules/`: standing rules and decisions (the part that must never be forgotten)
- `company/`: business facts, channel status
- `clients/`: one file per client (template included)
- `skills/`: Atlas, Scout, Scribe, Airtable, Jarvis (business modules only)
- `sops/drive-export/`: original SOP documents, history only
- `automations/`: notes on n8n and the offline worker build
- `legacy/`: old Jarvis project, history only
- `handoff-provenance/`: where the first import came from

No credentials, tokens or client prospect rows belong here. Workflow exports are allowed only with credentials stripped and after a secrets scan (see `automations/n8n-workflows/`).

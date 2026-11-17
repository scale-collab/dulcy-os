# Campaign Workflow Transition Coverage

Generated: 2026-07-29  
Environment: acceptance, fixture-backed

## Measured graph

| Measure | Result |
|---|---:|
| Canonical states reachable | 19/19 |
| Legal distinct-stage transitions accepted | 112/112 |
| Illegal distinct-stage transitions rejected | 230/230 |
| Complete distinct-stage matrix | 342/342 |
| Legal transitions persisted and recovered with matching journal | 112/112 |
| Canonical-stage restart checkpoints recovered | 19/19 |
| Dead-end states | 0 |
| Orphan states | 0 |

Same-stage calls are treated as idempotent updates and are not graph edges. The
342-edge matrix is every ordered pair of different canonical stages.

## Canonical stages

| Stage | Legal outgoing edges | Reachable | Restart checkpoint |
|---|---:|---:|---:|
| campaign_setup | 3 | yes | pass |
| campaign_planning | 4 | yes | pass |
| campaign_strategy_review | 5 | yes | pass |
| company_sample_build | 5 | yes | pass |
| company_sample_qa | 5 | yes | pass |
| company_sample_refinement | 5 | yes | pass |
| company_expansion | 4 | yes | pass |
| company_list_review | 5 | yes | pass |
| contact_generation | 4 | yes | pass |
| contact_qa | 4 | yes | pass |
| contact_refinement | 5 | yes | pass |
| leadmagic_enrichment | 4 | yes | pass |
| email_verification | 4 | yes | pass |
| copy_generation | 4 | yes | pass |
| copy_review | 5 | yes | pass |
| campaign_final_review | 7 | yes | pass |
| campaign_ready | 3 | yes | pass |
| campaign_paused | 18 | yes | pass |
| campaign_failed | 18 | yes | pass |

## Important enforced edges

- `campaign_setup -> campaign_planning`: accepted
- `campaign_planning -> campaign_strategy_review`: accepted
- `campaign_planning -> company_sample_build`: rejected
- `campaign_strategy_review -> company_sample_build`: accepted
- `company_sample_build -> company_sample_qa`: accepted
- `company_sample_qa -> company_sample_refinement`: accepted
- `company_sample_refinement -> company_sample_qa`: accepted
- `company_sample_qa -> company_expansion`: accepted
- `company_expansion -> company_list_review`: accepted
- `company_list_review -> contact_generation`: accepted

## Scope note

This report proves the state-machine contract, transition journal persistence,
and restart recovery for every graph edge. It does not claim that the downstream
Contact Generation through Campaign Ready business workflows are implemented;
Phase 3.5C remains bounded at the Contact Generation handoff.

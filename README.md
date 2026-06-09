# Trip Planning MVP

Itinerary-first AI trip planning workspace. Multi-agent development repo.

**Start here:** [output/agent.md](output/agent.md) — onboarding, ownership, and coordination rules for every branch agent.

## Quick links

| Doc | Purpose |
|-----|---------|
| [output/agent.md](output/agent.md) | Agent onboarding, folder map, coordination rules |
| [output/design-rules.md](output/design-rules.md) | Visual system, tokens, PlanChip spec |
| [output/contracts.md](output/contracts.md) | Data contracts, event payloads, state transitions |
| [output/components.md](output/components.md) | Component props, slots, composition rules |
| [output/roadmap.md](output/roadmap.md) | Module split, agent ownership, merge order |
| [output/seed-data.md](output/seed-data.md) | Canonical Kyoto demo trip fixture |
| [output/merge-checklist.md](output/merge-checklist.md) | PR readiness and integration checks |

## Folder structure

```
output/          — all agent-shared docs (source of truth)
app-shell/       — layout composition, top-level wiring (Agent 0)
design-system/   — tokens, primitives, PlanChip (Agent 1)
modules/
  trip-brief/        Agent 2
  itinerary/         Agent 3
  map/               Agent 4
  pocket/            Agent 5
  ingestion/         Agent 5
  copilot/           Agent 6
  revision-summary/  Agent 6
  constraint-engine/ Agent 7
  booking-records/   Agent 8
shared/
  types/         canonical interfaces (Agent 9)
  events/        event names + payloads (Agent 9)
  mock-data/     seeded Kyoto trip data (Agent 0 + 9)
  utils/         shared utilities (promoted only when reused)
tests/           integration, contract, drift checks (Agent 9)
```

## Branch naming

`agent/design-system` · `agent/trip-brief-generator` · `agent/itinerary-calendar`  
`agent/map-route` · `agent/pocket-ingestion` · `agent/copilot-revision`  
`agent/constraint-engine` · `agent/booking-records` · `agent/contracts-qa`

## Merge order

Phase 0: shell → design-system → contracts scaffold  
Phase 1: trip-brief → itinerary → pocket → copilot  
Phase 2: map → constraint-engine  
Phase 3: booking-records  
Phase 4: QA + final integration

# Roadmap — Multi-Agent Workflow for Wayfold

## Goal

Build the trip-planning MVP through parallel branch agents, with each agent owning one mature module or bounded context.

This product is itinerary-first.
The system should understand trip intent, turn messy research into pocket items, generate one strong itinerary, and let the user revise it through a calendar / map / pocket / chat workspace.

---

## Delivery principles

### 1. Slice by product capability, not by technical layer
Each branch agent should own a vertical module with UI, state shape, interactions, mock data contract, and tests for that area.
Do **not** split agents into vague horizontal buckets like “frontend”, “logic”, and “styling” only.

### 2. Keep one shell, many modules
Use one container app and several bounded modules.
The shell owns layout, shared tokens, routing, and app-level events.
Branch agents own independently deliverable modules inside that shell. This follows the general micro-frontend principle of smaller, decoupled codebases and explicit contracts between parts rather than one large tangled frontend [page:1].

### 3. Shared design system is mandatory
All agents must implement against the same design rules, especially:
- panel shell
- typography tiers
- tokenized colors
- `PlanChip` component family
- pin / lock states

No branch agent may invent component variants outside the shared spec.

### 4. Message contracts over shared hidden logic
Modules should communicate through explicit events, typed payloads, and app-level actions.
Avoid silent cross-module mutation.
This matches the broader recommendation to keep cross-application communication explicit and minimize shared state [page:1].

### 5. Ship demo-real, not infra-perfect
MVP can use mock data, stub AI, and simulated ingestion.
Prioritize believable interactions and module boundaries over production integrations.

---

## Suggested repo structure

```text
/app-shell
/design-system
/modules
  /trip-brief
  /itinerary
  /map
  /pocket
  /copilot
  /revision-summary
  /ingestion
  /booking-records
/shared
  /types
  /events
  /mock-data
  /utils
/docs
  design-rules.md
  roadmap.md
  contracts.md
```

---

## Branch agent map

### Agent 0 — Lead integrator
**Role**
Own the shell, shared contracts, merge order, and acceptance checks.

**Scope**
- app layout scaffold
- shared state boundaries
- event bus or store contract
- integration wiring
- merge QA
- regression review

**Outputs**
- app shell
- layout regions
- provider/store skeleton
- shared interfaces
- CI checklist

**Must not own long-term feature logic**
This role coordinates but should not absorb the modules of other agents.

---

### Agent 1 — Design system agent
**Role**
Turn `design-rules.md` into reusable UI primitives so all other agents build consistently.

**Owns**
- color tokens
- typography scale
- spacing tokens
- radius rules
- base panel shell
- button, input, badge, icon button
- canonical `PlanChip`
- pin / lock controls
- drag visual states

**Deliverables**
- token file
- component primitives
- component usage examples
- visual state matrix

**Definition of done**
- itinerary chip and pocket chip are the same component family
- no raw hardcoded style drift in feature modules

**Branch**
`agent/design-system`

---

### Agent 2 — Trip brief + generation agent
**Role**
Own the trip setup entry and the first-pass itinerary generation logic.

**Owns**
- trip brief form
- flexible date input
- broad destination input
- style selection
- transport preference
- optional freeform notes
- “Generate itinerary” action
- seeded mock planner that returns one itinerary only

**Deliverables**
- trip brief UI
- planner input schema
- mock plan generator
- loading and success states

**Rules**
- must generate one strong proposal, not multiple alternatives
- hidden briefing may exist internally, but visible UI should stay concise

**Branch**
`agent/trip-brief-generator`

---

### Agent 3 — Itinerary calendar agent
**Role**
Own the left-column itinerary, calendar chips, day groups, and drag interactions.

**Owns**
- day sections
- itinerary event rendering
- time grouping
- drag and drop between slots and days
- soft pin and hard fix states
- overlap/conflict visuals
- move from pocket into itinerary

**Deliverables**
- itinerary column UI
- chip drag/drop behavior
- pin/lock interactions
- event selection state
- mock recalculation hooks

**Rules**
- hard-fixed items resist movement
- promoted pocket items become scheduled chips using the same component family
- chip content must show key info without turning into full cards

**Branch**
`agent/itinerary-calendar`

---

### Agent 4 — Map and route agent
**Role**
Own the center-top map module and route visualization.

**Owns**
- map canvas
- map markers for itinerary and pocket items
- selected-day route line
- hover/select sync
- travel mode display
- mock travel-time previews

**Deliverables**
- map module UI
- marker and route rendering
- sync hooks for selected itinerary chip / pocket chip
- route summary strip

**Rules**
- no separate state truth for stops; consume shared trip data
- map highlights must respond to itinerary and pocket interactions

**Branch**
`agent/map-route`

---

### Agent 5 — Pocket and ingestion agent
**Role**
Own the center-bottom pocket board and research intake flow.

**Owns**
- pocket columns
- paste-link input
- quick-add input
- mock extracted cards
- source labels
- category filters
- drag from pocket to itinerary

**Deliverables**
- pocket board UI
- mock ingestion transformer
- categorized columns
- card filtering and sorting
- candidate promotion flow

**Rules**
- pocket items must reuse `PlanChip`
- no second visual card language
- ingestion can be mocked, but extraction results should feel believable

**Branch**
`agent/pocket-ingestion`

---

### Agent 6 — Copilot and revision-summary agent
**Role**
Own the right-side assistant panel, quick actions, and concise revision summaries.

**Owns**
- chat panel shell
- quick action chips
- message list
- revision summary card
- command parsing for mock prompts
- concise delta output after changes

**Deliverables**
- copilot UI
- predefined command actions
- revision summary formatter
- hidden briefing storage hook

**Rules**
- default response style is concise
- after a user change, show what changed only
- no verbose reasoning by default

**Branch**
`agent/copilot-revision`

---

### Agent 7 — Constraint and replanning engine agent
**Role**
Own the shared planning rules that govern pins, hard constraints, make-up items, and replanning.

**Owns**
- hard vs soft constraint model
- reservation-bound logic
- move validation
- missed-stop handling
- make-up candidate generation
- simple reweighting rules
- “lighten day”, “reduce transit”, “recover missed stop” transforms

**Deliverables**
- planner rules module
- event transformation functions
- constraint validator
- change-set payloads for revision summary

**Rules**
- hotels and non-cancelable reservations are hard constraints
- low-priority flexible items can move
- missed items can become make-up options later

**Branch**
`agent/constraint-engine`

---

### Agent 8 — Booking records and confirmations agent
**Role**
Own reservation records and mock email-confirmation linkage.

**Owns**
- booking cards / records
- reservation status chips
- confirmation state
- mock forwarded-email ingestion mapping to itinerary items
- alert badges for unconfirmed / confirmed items

**Deliverables**
- booking record UI
- reservation schema
- mock confirmation parser
- link-to-itinerary interactions

**Rules**
- booking management is auxiliary, not the main surface
- records must support hard constraints and confirmation reminders

**Branch**
`agent/booking-records`

---

### Agent 9 — Contracts and QA agent
**Role**
Own testing, contracts, and anti-drift enforcement.

**Owns**
- schema validation
- event contract tests
- design-token compliance checks
- interaction smoke tests
- regression snapshots

**Deliverables**
- `contracts.md`
- mock payload fixtures
- cross-module integration tests
- visual drift checklist

**Rules**
- no module merges without passing contract checks
- test user journeys across modules, but keep internal business logic tested at lower levels where possible, aligning with the general testing guidance for modular frontends [page:1]

**Branch**
`agent/contracts-qa`

---

## Recommended merge order

### Phase 0 — Foundation
1. Agent 0: app shell
2. Agent 1: design system
3. Agent 9: contracts scaffold

**Goal**
Make all later modules plug into a stable shell with fixed tokens and component primitives.

### Phase 1 — Core planning loop
4. Agent 2: trip brief + generator
5. Agent 3: itinerary calendar
6. Agent 5: pocket + ingestion
7. Agent 6: copilot + revision summary

**Goal**
User can generate a trip, inspect it, drag items, and see concise revisions.

### Phase 2 — Spatial and rule intelligence
8. Agent 4: map + route sync
9. Agent 7: constraint + replanning engine

**Goal**
Make the plan feel operational, not static.

### Phase 3 — Booking support
10. Agent 8: booking records + confirmation linkage

**Goal**
Add reservation-awareness without letting bookings dominate the product.

### Phase 4 — Hardening
11. Agent 9: QA expansion
12. Agent 0: final integration pass

---

## Module contracts

Define these shared contracts before branch work begins.

### Core entity: PlaceItem
```ts
interface PlaceItem {
  id: string
  title: string
  category: 'sight' | 'food' | 'stay' | 'transit' | 'backup' | 'booking'
  area: string
  lat?: number
  lng?: number
  estimatedDurationMin?: number
  sourceType?: 'blog' | 'email' | 'article' | 'manual' | 'ai'
  tripRole?: 'anchor' | 'supporting' | 'optional'
  reservationBound?: boolean
  tags?: string[]
}
```

### Scheduled entity: ItineraryItem
```ts
interface ItineraryItem extends PlaceItem {
  dayId: string
  startTime?: string
  endTime?: string
  pinState: 'none' | 'soft' | 'hard'
  priority: 'low' | 'medium' | 'high' | 'must'
  status?: 'scheduled' | 'missed' | 'makeup' | 'done'
  transitFromPrevMin?: number
}
```

### Revision summary payload
```ts
interface RevisionDelta {
  id: string
  type: 'move' | 'add' | 'drop' | 'time-shift' | 'pin-change' | 'makeup'
  itemTitle: string
  from?: string
  to?: string
  note?: string
}
```

### App events
```ts
TRIP_GENERATED
POCKET_ITEM_INGESTED
POCKET_ITEM_PROMOTED
ITINERARY_ITEM_MOVED
ITINERARY_ITEM_PINNED
ITINERARY_ITEM_LOCKED
PLAN_REVISED
RESERVATION_CONFIRMED
MISSED_STOP_MARKED
MAKEUP_OPTION_CREATED
```

---

## Branch workflow

Each branch agent should work with this template.

### Required inputs
- `design-rules.md`
- `roadmap.md`
- shared type contracts
- sample seeded trip data
- event naming rules

### Required outputs
- one isolated branch
- one module README
- one short assumptions list
- typed contract updates if needed
- demo GIF or screenshots if available

### Pull request checklist
- does not break `PlanChip`
- uses only approved tokens
- does not create duplicate state truth
- emits the right app events
- includes mock data fixtures
- includes at least one test or contract assertion

---

## Suggested seeded demo scenario

Use one realistic shared seed across all agents:
- Trip: Kyoto, 5 days
- Style: relaxed food + temples
- Transport: transit + walking
- Hard anchors: hotel, one dinner reservation, one timed temple visit
- Pocket candidates: market, cafe, backup museum, scenic detour, second dinner option

This shared scenario keeps branch outputs compatible.

---

## What should stay in the shell

The shell should own only:
- layout composition
- top header
- global navigation/state mount points
- app-level event broker
- selected item state
- theme and design tokens
- shared seeded data bootstrapping

The shell should **not** own:
- itinerary business rules
- ingestion parsing rules
- revision-summary formatting rules
- booking confirmation logic

---

## Risks and controls

### Risk 1 — UI drift
**Control:** Agent 1 blocks non-compliant component variants.

### Risk 2 — State duplication
**Control:** Agent 0 and Agent 9 enforce one shared source of truth for itinerary and pocket entities.

### Risk 3 — Over-coupled modules
**Control:** modules communicate through explicit events/contracts, which is consistent with the guidance to be deliberate about data and event flow across independently developed frontend parts [page:1].

### Risk 4 — Chat takes over the product
**Control:** copilot remains in the right rail; itinerary stays primary.

### Risk 5 — Branch merge pain
**Control:** foundation first, contracts first, merge in the recommended sequence instead of parallel free-for-all.

---

## MVP completion criteria

The MVP roadmap is complete when all of these are true:
- user can set a trip brief and generate one itinerary
- left calendar column supports drag, pin, and hard-fix behavior
- map reflects the selected day and selected chip
- pocket ingests mock research items and promotes them into the itinerary
- copilot can apply a few meaningful planning commands
- revision summary shows only what changed
- booking records can confirm reservations in mock form
- design remains consistent across all modules

---

## Immediate next documents

After this roadmap, prepare:
1. `contracts.md` — exact event payloads and shared interfaces
2. `components.md` — component props, states, and composition rules
3. `seed-data.md` — shared Kyoto demo content
4. `merge-checklist.md` — branch integration and review rules

---

## Default delegation summary

If assigning work immediately, use this split:
- Agent 0: shell + integration
- Agent 1: design system
- Agent 2: trip brief + generator
- Agent 3: itinerary calendar
- Agent 4: map + route
- Agent 5: pocket + ingestion
- Agent 6: copilot + revision summary
- Agent 7: constraint engine
- Agent 8: booking records
- Agent 9: contracts + QA

This gives each branch agent a mature, understandable module with clear ownership and limited overlap, which is the main advantage of decomposing a large frontend into smaller independently deliverable pieces [page:1].

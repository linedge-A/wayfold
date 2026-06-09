# Agent Guide — Wayfold

## Purpose

This document gives every branch agent the same starting context, scope boundaries, asset rules, and coordination protocol.

Use this file together with:
- [`./design-rules.md`](./design-rules.md)
- [`./roadmap.md`](./roadmap.md)
- `./contracts.md` *(to be added next)*
- `./components.md` *(to be added next)*
- `./seed-data.md` *(to be added next)*
- `./merge-checklist.md` *(to be added next)*

If any of those documents conflict, priority order is:
1. `design-rules.md`
2. `contracts.md`
3. `roadmap.md`
4. feature branch assumptions

---

## Product context

This product is an itinerary-first AI trip planning workspace.
It is not a chat-first assistant and not a booking-wallet-first app.

The system should:
- understand user intent from simple trip inputs plus messy saved research,
- generate **one** strong itinerary,
- let users edit it visually through calendar / map / pocket / copilot,
- apply planning logic around hard and soft constraints,
- show concise revision summaries that explain only what changed.

Core UI shape:
- Left: itinerary calendar column
- Middle top: map
- Middle bottom: pocket lists
- Right: copilot / chat

Visual direction:
- Any.do-style calm productivity UI
- shared `PlanChip` family across itinerary and pocket
- pin / lock constraints on itinerary chips
- strict anti-drift component system

---

## Folder map

Use this structure.
Do not create parallel folders for the same concern.

```text
/output
  agent.md
  design-rules.md
  roadmap.md
  contracts.md
  components.md
  seed-data.md
  merge-checklist.md

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
  /constraint-engine
/shared
  /types
  /events
  /mock-data
  /utils
/tests
```

### Folder rules
- `app-shell` owns composition and layout only.
- `design-system` owns tokens and shared UI primitives only.
- `modules/*` own feature logic and bounded UI.
- `shared/types` owns cross-module interfaces.
- `shared/events` owns event names and payload schemas.
- `shared/mock-data` owns seeded trip data.
- `tests` owns integration, contract, and drift checks.

Do not put feature-specific utilities in `shared` unless at least two modules genuinely use them.

---

## Source-of-truth docs

### `design-rules.md`
Use for:
- colors
- typography
- spacing
- radii
- panel shell
- `PlanChip`
- pin / lock states
- anti-drift rules

### `roadmap.md`
Use for:
- branch-agent ownership
- module boundaries
- merge order
- delivery phases
- shared contracts overview

### `contracts.md`
Use for:
- canonical interfaces
- app event payloads
- allowed state transitions
- module input/output contracts

### `components.md`
Use for:
- component props
- slots
- state variants
- composition rules

### `seed-data.md`
Use for:
- canonical demo trip
- sample pocket items
- bookings
- revision examples

### `merge-checklist.md`
Use for:
- PR criteria
- branch readiness
- integration checks
- visual drift review

---

## Agent roster

### Agent 0 — Lead integrator
**Owns**
- shell scaffold
- app composition
- top-level state wiring
- merge sequencing
- integration QA

**May edit**
- `/app-shell`
- `/tests/integration`
- doc links in `/output`

**May not own long-term logic for feature modules**

### Agent 1 — Design system
**Owns**
- `/design-system`
- shared tokens
- base UI primitives
- canonical `PlanChip`

**Only this agent may change**
- token values
- panel shell style
- chip structure
- pin/lock visual rules

### Agent 2 — Trip brief + generation
**Owns**
- `/modules/trip-brief`
- trip input schema
- generate-itinerary entry flow

### Agent 3 — Itinerary calendar
**Owns**
- `/modules/itinerary`
- day groups
- calendar chips
- drag/drop behavior
- pin/lock interactions

### Agent 4 — Map + route
**Owns**
- `/modules/map`
- route visualization
- marker sync
- selected-day spatial state

### Agent 5 — Pocket + ingestion
**Owns**
- `/modules/pocket`
- `/modules/ingestion`
- pasted-link intake
- candidate extraction mocks
- column board logic

### Agent 6 — Copilot + revision summary
**Owns**
- `/modules/copilot`
- `/modules/revision-summary`
- quick actions
- delta summaries
- concise command responses

### Agent 7 — Constraint engine
**Owns**
- `/modules/constraint-engine`
- replanning rules
- hard/soft constraint logic
- make-up candidate logic

### Agent 8 — Booking records
**Owns**
- `/modules/booking-records`
- reservation records
- confirmation state
- booking-to-itinerary links

### Agent 9 — Contracts + QA
**Owns**
- `/shared/types`
- `/shared/events`
- `/tests/contracts`
- `/tests/smoke`

**Only this agent may change canonical shared interfaces without approval from Agent 0.**

---

## Entry checklist for every agent

Before writing code, every agent must confirm:

1. I have read `design-rules.md`.
2. I have read `roadmap.md`.
3. I know my owned folder(s).
4. I know which files I am not allowed to edit.
5. I know the shared types and events my module consumes/emits.
6. I know the seeded trip scenario.
7. I will not introduce a second component language.
8. I will document assumptions in my branch README or PR notes.

If any answer is “no,” stop and resolve before coding.

---

## Labor division rules

### Vertical ownership first
Agents own a feature slice, not just a layer.
Each owned slice should include:
- UI
- local state
- module logic
- tests
- fixtures
- docs for that module

### Shared assets are controlled
Shared assets have single owners.
No drive-by edits.

#### Shared asset ownership
- Tokens and primitives → Agent 1
- Shared interfaces and events → Agent 9
- App shell composition → Agent 0
- Seeded demo data → Agent 0 + Agent 9
- Core docs in `/output` → Agent 0 maintains link integrity

### Feature agents should avoid touching
- another agent’s module folder
- token files
- shared interface files
- seeded demo data shape
unless they open a coordination request first.

---

## Asset management rules

### 1. File placement
Every file should have one obvious home.
Do not create duplicates like:
- `utils.ts` in multiple modules for the same purpose
- alternate mock data files with overlapping truth
- extra design tokens outside `design-system`

### 2. Naming
Use clear names.
Examples:
- `plan-chip.tsx`
- `itinerary-day-column.tsx`
- `revision-delta-card.tsx`
- `constraint-rules.ts`

Avoid vague names like:
- `helpers.ts`
- `misc.ts`
- `new-utils.ts`
- `final-card.tsx`

### 3. Module-local first
If code is only used by one module, keep it inside that module.
Promote to shared only when reused and stable.

### 4. Mock data discipline
- one canonical seeded trip
- one canonical list of events
- one canonical set of pocket items
- derived views may exist, but not copied truths

### 5. Doc hygiene
When adding a new document:
- place it in `/output`
- link it from `agent.md`
- state owner and purpose at the top
- avoid overlapping docs with unclear authority

---

## Coordination rules

These rules exist to prevent race conditions, merge collisions, and silent schema drift.

### Rule 1 — No direct edits to protected assets
Protected assets:
- `/design-system/**`
- `/shared/types/**`
- `/shared/events/**`
- `/output/design-rules.md`
- `/output/contracts.md`

Only the designated owner may merge changes there.

### Rule 2 — Contract change requires notice
If an agent needs to change a shared type, event, or component contract:
1. open a coordination note,
2. describe old contract,
3. describe proposed change,
4. list affected agents,
5. wait for owner approval,
6. then update docs and code together.

No silent contract edits.

### Rule 3 — Branches should be narrow
Each branch should target one owned module or one approved contract update.
Do not mix feature work and broad refactors in the same branch.

### Rule 4 — One owner per merge train
For each integration wave, Agent 0 decides merge order.
Other agents do not self-merge out of sequence.

### Rule 5 — Rebase before review
Before opening PR:
- rebase on latest integration branch,
- resolve conflicts locally,
- rerun smoke checks,
- confirm no drift in shared assets.

### Rule 6 — Event-first integration
Cross-module communication must use explicit events or typed shared actions.
Do not reach directly into another module’s private state.

### Rule 7 — Temporary forks expire fast
If a temporary adapter or shim is needed, it must include:
- why it exists,
- which branch depends on it,
- removal condition.

No permanent “temporary” glue.

### Rule 8 — Feature flags for unstable joins
If a module is not integration-safe yet, gate it behind a feature flag or stub adapter instead of half-merging broken behavior.

---

## Race prevention playbook

### Common race: token drift
**Cause:** multiple agents tweak color, radius, or chip styling.
**Prevention:** only Agent 1 can edit token files or `PlanChip` structure.

### Common race: shared type drift
**Cause:** itinerary, pocket, and copilot agents all add fields differently.
**Prevention:** Agent 9 owns canonical interfaces; changes go through contract review.

### Common race: seeded data mismatch
**Cause:** agents test against different trip fixtures.
**Prevention:** only one canonical seeded trip in `/shared/mock-data`.

### Common race: conflicting drag/drop behavior
**Cause:** itinerary and pocket teams implement incompatible assumptions.
**Prevention:** drag payload contract is defined centrally in `contracts.md` before branch implementation.

### Common race: revision-summary mismatch
**Cause:** different modules emit different change payloads.
**Prevention:** one shared `RevisionDelta` schema; Agent 6 formats, Agent 7 produces rule-aware deltas, Agent 9 validates.

---

## Required branch conventions

### Branch naming
Use:
- `agent/design-system`
- `agent/trip-brief-generator`
- `agent/itinerary-calendar`
- `agent/map-route`
- `agent/pocket-ingestion`
- `agent/copilot-revision`
- `agent/constraint-engine`
- `agent/booking-records`
- `agent/contracts-qa`

For follow-up fixes:
- `agent/<module>-fix/<short-name>`

### Commit style
Use concise functional commits, e.g.:
- `Add PlanChip base states`
- `Implement itinerary day groups`
- `Define revision delta payload`

Avoid vague commit messages like `update stuff`.

---

## PR template requirements

Each PR should include:
- module owned
- scope summary
- files touched
- contracts touched
- screenshots or demo note
- test coverage note
- assumptions made
- follow-up items

If a PR touches protected assets, explicitly tag the owning agent.

---

## Cross-module dependency map

### Safe dependency direction
- feature modules may depend on `design-system`
- feature modules may depend on `shared/types`
- feature modules may depend on `shared/events`
- shell may compose feature modules

### Unsafe dependency direction
- one feature module importing another feature module’s internal utils
- one module mutating another module’s state directly
- token overrides inside feature modules

### Integration pattern
Use this pattern:
1. consume shared types
2. emit typed events
3. let shell or shared orchestrator coordinate
4. receive updated state through approved interfaces

---

## Documentation organization

Keep `/output` clean and small.
Each file should answer one question.

Recommended docs and purpose:
- `agent.md` — onboarding, ownership, coordination
- `design-rules.md` — visual system and anti-drift rules
- `roadmap.md` — module split and delivery phases
- `contracts.md` — data/event contracts
- `components.md` — component definitions and props
- `seed-data.md` — demo fixtures
- `merge-checklist.md` — review and integration checklist

Do not create overlapping docs like:
- `notes-final.md`
- `ui-thoughts-v2.md`
- `temp-contracts.md`
unless they are clearly marked as working drafts and owned.

---

## Minimal asset register

Maintain a simple asset register in PRs or docs for high-risk shared assets:
- token file
- `PlanChip`
- event schema file
- shared seeded trip
- revision delta schema
- drag payload schema

For each asset, track:
- owner
- consumers
- last changed by
- pending changes

---

## Default handoff protocol

When an agent finishes a branch, handoff should include:
- what was built
- what contracts were used
- what contracts were added or proposed
- known limitations
- screenshots or demo state notes
- what the next dependent agent needs to know

Keep handoff short and structured.

---

## Stop conditions

An agent must pause and ask for coordination if:
- a shared type seems wrong,
- a token or chip rule needs changing,
- seeded data is insufficient,
- another module’s behavior must change first,
- the feature requires a second source of truth,
- the work would violate `design-rules.md`.

Do not improvise around these issues silently.

---

## Acceptance criteria for coordinated work

The multi-agent workflow is healthy only if all are true:
- every agent can identify owned folders immediately,
- shared assets have clear owners,
- contract changes are visible and approved,
- no module creates a second visual language,
- the repo stays easy to navigate,
- seeded demo data remains consistent,
- merge order is controlled by Agent 0,
- integration does not rely on hidden assumptions.

---

## Default summary

If there is ambiguity, default to this:
- protect shared assets,
- keep modules vertically owned,
- route cross-module behavior through contracts,
- update docs when contracts change,
- keep one canonical `PlanChip`,
- keep one canonical seeded trip,
- let Agent 0 coordinate merges,
- do not invent parallel systems.

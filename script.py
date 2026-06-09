from pathlib import Path
import zipfile

out = Path('output')
out.mkdir(exist_ok=True)

contracts = r'''# Contracts — Wayfold

## Purpose

This document defines the canonical data contracts, event payloads, and state transition rules for the trip-planning MVP.

It exists to prevent drift between branch agents working on itinerary, map, pocket, copilot, booking, and constraint modules.

If a contract changes, update this file first or in the same pull request.

---

## Contract priorities

Priority order:
1. `design-rules.md` for visual rules
2. `contracts.md` for data and event truth
3. `components.md` for component composition
4. `roadmap.md` for ownership and sequence

---

## Core entities

### TripBrief
```ts
interface TripBrief {
  id: string
  title: string
  destination: string
  startDate?: string
  endDate?: string
  flexibleDates?: boolean
  style?: 'relaxing' | 'balanced' | 'intense' | 'luxury' | 'budget'
  transport?: 'walk' | 'transit' | 'drive' | 'mixed'
  notes?: string
}
```

### PlaceItem
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

### ItineraryItem
```ts
interface ItineraryItem extends PlaceItem {
  dayId: string
  startTime?: string
  endTime?: string
  pinState: 'none' | 'soft' | 'hard'
  priority: 'low' | 'medium' | 'high' | 'must'
  status?: 'scheduled' | 'missed' | 'makeup' | 'done'
  transitFromPrevMin?: number
  note?: string
}
```

### PocketColumn
```ts
interface PocketColumn {
  id: string
  title: string
  items: PlaceItem[]
}
```

### BookingRecord
```ts
interface BookingRecord {
  id: string
  title: string
  category: 'hotel' | 'restaurant' | 'ticket' | 'transport'
  confirmationCode?: string
  confirmed: boolean
  cancelable?: boolean
  linkedItemId?: string
  date?: string
  time?: string
}
```

### RevisionDelta
```ts
interface RevisionDelta {
  id: string
  type: 'move' | 'add' | 'drop' | 'time-shift' | 'pin-change' | 'makeup' | 'confirm'
  itemTitle: string
  from?: string
  to?: string
  note?: string
}
```

---

## App state shape

```ts
interface AppState {
  tripBrief: TripBrief
  itineraryDays: {
    id: string
    label: string
    date: string
    areaSummary?: string
    items: ItineraryItem[]
  }[]
  pocket: PocketColumn[]
  bookings: BookingRecord[]
  selectedItemId?: string
  selectedDayId?: string
  revisionDeltas: RevisionDelta[]
}
```

---

## Drag payload

```ts
interface DragPayload {
  itemId: string
  source: 'pocket' | 'itinerary'
  sourceColumnId?: string
  sourceDayId?: string
  targetDayId?: string
  targetIndex?: number
}
```

Rules:
- Pocket to itinerary creates or promotes an `ItineraryItem`.
- Itinerary to itinerary preserves item identity.
- Hard-pinned items require explicit unlock before move.

---

## Events

### Canonical event names
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

### Example payloads

```ts
interface TripGeneratedEvent {
  type: 'TRIP_GENERATED'
  itineraryDays: AppState['itineraryDays']
}
```

```ts
interface PocketItemPromotedEvent {
  type: 'POCKET_ITEM_PROMOTED'
  itemId: string
  targetDayId: string
  targetIndex: number
}
```

```ts
interface PlanRevisedEvent {
  type: 'PLAN_REVISED'
  deltas: RevisionDelta[]
}
```

---

## State transitions

Allowed:
- pocket item -> itinerary item
- itinerary item -> different day
- unpinned -> soft pin -> hard pin
- scheduled -> missed -> makeup
- booking unconfirmed -> confirmed

Blocked unless explicitly unlocked:
- hard-pinned move
- deleting required hard-anchor item

---

## Ownership rules

- Agent 9 owns shared types and event contracts.
- Agent 6 consumes `RevisionDelta` but does not redefine it.
- Agent 7 emits planning deltas but does not fork payload shape.
- Agent 3 and Agent 5 must use the same `DragPayload`.

---

## Acceptance

A module is contract-compliant only if:
- it imports shared types rather than redefining them,
- it emits canonical events,
- it does not add hidden required fields,
- it handles hard-pin behavior consistently.
'''

components = r'''# Components — Wayfold

## Purpose

This document defines component boundaries, props, shared states, and composition rules for the MVP.

Use this with `design-rules.md` and `contracts.md`.

---

## Core composition map

- `AppShell`
- `TopHeader`
- `ItineraryPanel`
- `MapPanel`
- `PocketPanel`
- `CopilotPanel`
- `BookingDrawer` *(optional in MVP view)*

Shared primitives:
- `PanelShell`
- `PlanChip`
- `PinControl`
- `StatusBadge`
- `TimeBadge`
- `IconButton`
- `PrimaryButton`
- `TextInput`

---

## PanelShell

### Purpose
Shared base shell for itinerary, map, pocket, and copilot panels.

### Props
```ts
interface PanelShellProps {
  title?: string
  actions?: ReactNode
  children: ReactNode
  scroll?: boolean
}
```

### Rules
- All major panels must use `PanelShell`.
- Do not build custom panel wrappers per module.

---

## PlanChip

### Purpose
Canonical item component used by itinerary and pocket.

### Props
```ts
interface PlanChipProps {
  title: string
  category: string
  area?: string
  timeRange?: string
  durationLabel?: string
  sourceLabel?: string
  note?: string
  status?: 'default' | 'selected' | 'dragging' | 'conflict' | 'done' | 'dimmed'
  pinState?: 'none' | 'soft' | 'hard'
  reservation?: boolean
  draggable?: boolean
  onClick?: () => void
  onPinToggle?: () => void
  onLockToggle?: () => void
}
```

### Slots
- leading marker
- title row
- metadata row
- optional note row
- trailing actions

### Rules
- `PlanChip` is the only allowed event-card language.
- Pocket chips are unscheduled `PlanChip`s.
- Itinerary chips are scheduled `PlanChip`s.

---

## ItineraryDayColumn

### Props
```ts
interface ItineraryDayColumnProps {
  dayId: string
  label: string
  date: string
  areaSummary?: string
  items: ItineraryItem[]
}
```

### Rules
- Renders a stack of `PlanChip` items.
- Supports drag target insertion.
- Owns no independent item schema.

---

## PocketColumnBoard

### Props
```ts
interface PocketColumnBoardProps {
  columns: PocketColumn[]
  filters?: string[]
}
```

### Rules
- Renders columns only.
- Cards inside columns must still be `PlanChip`.

---

## RevisionDeltaCard

### Props
```ts
interface RevisionDeltaCardProps {
  deltas: RevisionDelta[]
}
```

### Rules
- Shows only what changed.
- No verbose reasoning by default.
- Top of copilot panel after plan changes.

---

## CopilotQuickActions

### Suggested actions
- Shorter day
- More food stops
- Reduce transit
- More relaxing
- Prioritize must-sees
- Recover missed stop

### Rules
- Quick actions trigger predefined transforms.
- Results should flow into `RevisionDeltaCard`.

---

## MapPanel

### Props
```ts
interface MapPanelProps {
  items: PlaceItem[]
  selectedItemId?: string
  selectedDayId?: string
}
```

### Rules
- Reads shared data only.
- Does not become a second source of truth for itinerary order.

---

## BookingRecordCard

### Props
```ts
interface BookingRecordCardProps {
  record: BookingRecord
}
```

### Rules
- Booking UI is secondary.
- Confirmation state should sync to linked itinerary item where relevant.

---

## Anti-drift component rules

- No alternate chip card component.
- No alternate panel shell.
- No custom pin widget outside `PinControl`.
- No duplicate badge styling systems.
- New component types must be added here before implementation.
'''

seed = r'''# Seed Data — Wayfold

## Purpose

This file defines the canonical demo trip and sample content used by all branch agents.

Use one shared seed only.
Do not fork alternate versions per module.

---

## Demo trip

### Trip brief
- Title: Kyoto food + temples
- Destination: Kyoto
- Dates: 2026-11-10 to 2026-11-14
- Flexible dates: false
- Style: relaxing
- Transport: transit + walking
- Notes: first trip, wants good food, some classic temples, not overpacked

---

## Day structure

### Day 1 — Gion arrival
- Hotel check-in
- Nishiki Market
- Yasaka Shrine evening walk

### Day 2 — East Kyoto
- Kiyomizu-dera timed visit
- Sannenzaka / Ninenzaka
- Tea break
- Dinner reservation

### Day 3 — Arashiyama light day
- Bamboo Grove
- Tenryu-ji
- Riverside lunch
- Flexible cafe stop

### Day 4 — Central city mix
- Museum backup option
- Shopping street
- Optional gourmet detour

### Day 5 — Departure buffer
- Late breakfast
- Pickup make-up stop if needed
- Transit to station

---

## Hard anchors

- Hotel reservation for all nights
- Kiyomizu-dera timed visit on Day 2 morning
- Omakase dinner reservation on Day 2 evening

These should map to hard constraints or booking-linked items.

---

## Pocket columns

### Must see
- Kiyomizu-dera
- Nishiki Market
- Yasaka Shrine
- Arashiyama Bamboo Grove

### Maybe
- Kyoto International Manga Museum
- Philosopher’s Path
- Kyoto Station rooftop view

### Food
- Omakase dinner
- Katsu curry shop
- Kissaten cafe
- Matcha dessert stop

### Reservations
- Hotel booking
- Omakase dinner booking
- Temple timed ticket

### Backup
- Indoor museum
- Department store food hall
- Additional cafe

---

## Example pocket items

### PlaceItem sample
```ts
{
  id: 'place-kiyomizu',
  title: 'Kiyomizu-dera',
  category: 'sight',
  area: 'Higashiyama',
  estimatedDurationMin: 90,
  sourceType: 'ai',
  tripRole: 'anchor',
  reservationBound: true,
  tags: ['temple', 'classic', 'timed']
}
```

```ts
{
  id: 'place-omakase',
  title: 'Omakase Dinner',
  category: 'food',
  area: 'Gion',
  estimatedDurationMin: 120,
  sourceType: 'email',
  tripRole: 'anchor',
  reservationBound: true,
  tags: ['gourmet', 'reservation']
}
```

---

## Example revision deltas

- Moved Nishiki Market to Day 1 afternoon.
- Shifted tea break to 3:30 PM.
- Added Matcha Dessert Stop to Day 3.
- Marked Kyoto Station rooftop as make-up option for Day 5.

These should be concise and user-facing.

---

## Example commands

- Make day 3 lighter
- Add one gourmet detour
- Reduce transit on day 2
- Recover missed stop tomorrow
- Keep temples but cut walking

---

## Seed data rules

- All modules should reference this same trip.
- Do not rename places casually across modules.
- If seed data changes, update all examples in one pass.
'''

merge = r'''# Merge Checklist — Wayfold

## Purpose

This document defines branch readiness and integration checks for the MVP.

---

## PR checklist

- Scope matches owned module.
- Shared contracts were not changed silently.
- Design tokens were not forked.
- `PlanChip` was not duplicated.
- Screens or states affected are shown in screenshots or notes.
- Tests or smoke checks were run.
- Seed data still matches canonical trip.

---

## Integration checklist

- App shell composes modules without layout break.
- Itinerary and pocket use the same chip family.
- Map highlights selected chip correctly.
- Revision summary shows concise deltas.
- Hard-pinned items resist invalid moves.
- Booking confirmations map to linked items.

---

## Merge order

1. design system
2. contracts
3. trip brief
4. itinerary
5. pocket
6. copilot
7. map
8. constraint engine
9. booking
10. final integration
'''

files = {
    'contracts.md': contracts,
    'components.md': components,
    'seed-data.md': seed,
    'merge-checklist.md': merge,
}

for name, content in files.items():
    (out/name).write_text(content, encoding='utf-8')

zip_path = out/'trip-planning-docs.zip'
all_files = [
    out/'design-rules.md',
    out/'roadmap.md',
    out/'agent.md',
    out/'contracts.md',
    out/'components.md',
    out/'seed-data.md',
    out/'merge-checklist.md',
]
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for f in all_files:
        if f.exists():
            zf.write(f, arcname=f.name)

print('created', [f.name for f in all_files if f.exists()])
print('zip', zip_path.name, zip_path.stat().st_size)

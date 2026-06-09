# Components — Trip Planning MVP

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

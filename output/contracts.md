# Contracts — Wayfold

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
  group?: string   // user/paste-time organizing cluster for the Research Pocket (set at ingestion). DISTINCT from `area`: `area` is the POI's canonical geography; `group` is how the user filed it (which paste / day / theme), which may span areas or split one area across days.
}
```
> `group` added by the unified-pocket work (Agent 5, with Agent 9 contract notice). Optional & additive — existing producers/consumers are unaffected; the pocket falls back to `area` when it is absent.
>
> **Why a dedicated field, not `area` or `tags`:** `area` is per-POI geography (one value, canonical) and must stay stable for the map/optimizer; it can't double as a mutable user filing label. `tags` is an unordered keyword *set* with no single-cluster semantics, so it can't drive a one-column-per-group view. `group` is the single organizing key the pocket groups by. It currently mirrors `area` only because ingestion seeds it from the paste's area hint; once per-day paste / manual re-filing land, `group` diverges from `area` (its reason for existing).

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
  confirmed: boolean                 // canonical binary flag (kept); invariant below
  cancelable?: boolean
  linkedItemId?: string              // @deprecated — prefer linkedItemIds; == linkedItemIds[0] when both set
  date?: string
  time?: string

  // Extended (optional, additive) — parsed bookings, ingestion lane
  status?: 'confirmed' | 'cancelled' | 'changed' | 'pending'
  vendor?: string
  linkedItemIds?: string[]           // one booking → several anchors (multi-leg / multi-night)
  startISO?: string                  // ISO 8601 + offset; supersedes date/time when known
  endISO?: string
  timezone?: string                  // IANA, e.g. "Asia/Tokyo"
  from?: string                      // transport origin (IATA/station)
  to?: string                        // transport destination
  seatOrRoom?: string
  party?: number
  price?: string
  sourceEmailId?: string             // idempotent re-import + cancellation match
}
```

**Agent 9 decisions (re: PR #5 contract proposal):**
- `category` enum is **not** expanded — `from`/`to` disambiguate flight/rail/car within `'transport'`.
- `confirmed` is **kept** (actively consumed); `status` is the richer state. Invariant when both set: `confirmed === (status === 'confirmed')`.
- `linkedItemId` **kept** for back-compat; `linkedItemIds?: string[]` added for multi-segment. When both present, `linkedItemId === linkedItemIds[0]`.
- All additions are optional → zero breakage; existing `INITIAL_BOOKINGS` are unaffected.
- A `status` of `'cancelled'`/`'changed'` should unlock the linked anchor(s) and emit `PLAN_REVISED`.

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
  currentView: 'plan' | 'trips' | 'explore' | 'pocket'  // top-level route; 'pocket' = global Research Pocket board (added additively, Agent 9 approved)
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

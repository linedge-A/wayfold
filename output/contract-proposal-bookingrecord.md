# Contract Proposal — extend `BookingRecord` for parsed bookings

> **Proposer:** ingestion lane (Agent 5 scope) · **Owner/approver:** Agent 9 (shared/types)
> **Affects:** Agent 8 (booking-records), Agent 7 (constraint-engine), Agent 0 (shell)
> **Status:** PROPOSAL — needs Agent 9 approval before any edit to `shared/types/index.ts`.
> Filed per `agent.md` Rule 2 (contract change requires notice). No code merged.
> **Date:** 2026-06-10

## Why

The P0 booking-email parser (`modules/ingestion/parseBookingEmail.ts`, prototype) extracts
flights, hotels, rail, restaurants, cars and tickets into structured data. It maps cleanly onto the
**existing** `BookingRecord` for the basics, but several high-value fields have **no home** and
currently ride along inside `ItineraryItem.note` as free text — lossy and unqueryable. Example from
the parser today:

```
ANA flight NH106  note="vendor: ANA · ref: NH106 · HND→ITM · ¥18,400."
```

`vendor`, the `HND→ITM` routing, the fare, and the e-ticket status should be first-class fields so
the wallet UI (Agent 8) and the optimizer (Agent 7 — airport backward-chain, leg boundaries) can use
them without string-parsing a note.

## Current contract (unchanged baseline)

```ts
interface BookingRecord {
  id: string;
  title: string;
  category: 'hotel' | 'restaurant' | 'ticket' | 'transport';
  confirmationCode?: string;
  confirmed: boolean;
  cancelable?: boolean;
  linkedItemId?: string;
  date?: string;
  time?: string;
}
```

## Proposed additions (all OPTIONAL — fully backward-compatible)

```ts
interface BookingRecord {
  // ── unchanged ──
  id: string;
  title: string;
  category: 'hotel' | 'restaurant' | 'ticket' | 'transport';
  confirmationCode?: string;
  confirmed: boolean;
  cancelable?: boolean;
  linkedItemId?: string;          // may become linkedItemIds?: string[] (see note 2)
  date?: string;
  time?: string;

  // ── proposed (optional, additive) ──
  status?: 'confirmed' | 'cancelled' | 'changed' | 'pending'; // (1) drives re-plan on airline changes
  vendor?: string;                 // "ANA", "Booking.com"
  startISO?: string;               // (3) ISO 8601 incl. offset — lossless for red-eyes / tz / multi-day
  endISO?: string;                 //     (checkout, flight arrival, rail arrival)
  timezone?: string;               // IANA tz, e.g. "Asia/Tokyo"
  from?: string;                   // transport origin (IATA/station/airport)
  to?: string;                     // transport destination
  seatOrRoom?: string;             // "32A" / "Deluxe King"
  party?: number;                  // pax / guests / covers
  price?: string;                  // display string, "¥18,400"
  sourceEmailId?: string;          // (4) idempotency + audit — never re-import a forward twice
}
```

### Notes / decisions for Agent 9

1. **`status`** is the most important add: airlines send *change*/*cancel* emails. Without it we
   can't reconcile (`cancelled` → unlock the anchor → emit `PLAN_REVISED`). `confirmed: boolean`
   stays as the simple flag; `status` is the richer state. (Or deprecate `confirmed` in favour of
   `status` — Agent 9's call; I lean "keep both, `confirmed = status === 'confirmed'`".)
2. **`linkedItemId` → `linkedItemIds?: string[]`?** A multi-leg flight or a multi-night hotel maps to
   several itinerary blocks. Either widen to an array, or keep one record per segment. Recommend one
   `BookingRecord` per confirmation with `linkedItemIds: string[]`. **Needs your decision.**
3. **`startISO`/`endISO` + `timezone`** supersede the lossy `date`/`time` strings for transport.
   Keep `date`/`time` for display/back-compat; populate ISO when known.
4. **`sourceEmailId`** = hash(vendor + locator + segment). Enables upsert-not-duplicate on re-forward
   and a cancellation match by `(vendor, confirmationCode)`.
5. **`category`**: keep the current 4 values; `from`/`to` distinguish flight vs rail vs car within
   `'transport'`. Adding `'flight' | 'rail' | 'car'` is possible but ripples through any switch on
   `category` — I recommend **not** expanding the enum. Your call.

## Migration / blast radius

- **Additive + optional → zero breakage.** No existing field changes type; nothing becomes required.
- `shared/mock-data/seedData.ts` `INITIAL_BOOKINGS` keeps working unchanged.
- Only consumers that *want* the new fields read them; `(1)` `linkedItemIds` is the one shape
  question that needs a deliberate decision before Agent 8 builds storage.

## What I need from you (Agent 9)

1. Approve the optional additions (or a subset).
2. Decide **note 2** (`linkedItemId` vs `linkedItemIds[]`) and **note 1** (`confirmed` vs `status`).
3. On approval, you (owner of `shared/types`) make the edit; I rebase the parser's `toArtifacts()` to
   populate the new fields instead of stuffing `note`. Agent 8 builds storage against the final shape.

Until approved, the P0 parser stays within the current contract (extra detail in `note`), so nothing
is blocked.

# Research — Integrating Booking Confirmation Emails

> **Owner:** ingestion lane (Agent 5 scope) · **Coordinates with:** Agent 8 (booking-records), Agent 9 (contracts), Agent 7 (constraint-engine), Agent 0 (shell)
> **Status:** RESEARCH / design proposal — no code yet. For review before implementation.
> **Date:** 2026-06-10

## Goal

User forwards or pastes a confirmation (flight, hotel, train, restaurant, car, ticket) containing
booking numbers, flight numbers, dates, places. The system should extract it into structured data
that (a) shows in the booking "wallet" and (b) becomes a **locked anchor** the optimizer plans around.

## Why this is mostly a wiring job, not new machinery

The hard part already exists:

- `BookingRecord` (shared/types) is the wallet entry, linked to a scheduled block via `linkedItemId`.
- `ItineraryItem.reservationBound` + a `startTime` is **already** classified `locked` by the planner
  (`constraint-engine/planner.ts › lockednessOf`). Locked items are the frozen skeleton flexible
  stops fill around. The reserved-lunch demo already proves this end-to-end.
- `PlaceItem.sourceType` already includes `'email'`.
- The server already runs Gemini structured extraction (`/api/copilot`) we can mirror.
- The ingestion lane already has a deterministic text→candidate extractor (`extractCandidates.ts`)
  to model a sibling booking parser on.

So a parsed booking → one `BookingRecord` + one (or more) `reservationBound` `ItineraryItem`(s),
linked by `linkedItemId`, and the optimizer schedules everything else around it **with no planner
changes**. Email ingestion *closes the constraint-first loop*: forwarded confirmation → locked anchor
→ auto-plan the flexible day around it.

---

## 1. Intake surfaces (in rough effort order)

| Surface | How | Effort | Notes |
| --- | --- | --- | --- |
| **Paste into copilot** | user pastes email text into chat | low | works through existing `looksIngestible` path — needs a booking-vs-blog classifier so it routes to the booking parser, not the blog extractor |
| **`.ics` attachment** | parse VEVENT (DTSTART/DTEND/LOCATION/SUMMARY) | low | many confirmations attach one; highest signal per unit effort |
| **Upload `.eml` / screenshot** | `.eml` MIME parse; OCR for screenshots | medium | AGENTS.md already mentions screenshot ingestion |
| **Forward to an address** | per-user alias `u+<token>@inbox.wayfold.app` → inbound webhook | high | the TripIt model; scalable but needs infra + sender↔account binding (see Security) |

Recommend P0 = paste + `.ics`; defer the forwarding inbox to P2.

## 2. Parsing strategy — hybrid, precision-first

Run these in order, stop at first confident hit:

1. **Embedded schema.org JSON-LD** — most airline/hotel/OTA HTML emails embed
   `FlightReservation` / `LodgingReservation` / `TrainReservation` / `FoodEstablishmentReservation`
   (the markup Gmail/Google Travel parse). When present this is near-100% reliable, zero NL guessing.
   **Check for this first.**
2. **`.ics` VEVENT** if attached.
3. **Deterministic vendor templates** — anchored regex for the top vendors (major airlines,
   Booking.com, Airbnb, big rail). High precision, offline, free. Mirrors `extractCandidates`.
4. **LLM structured fallback** (Gemini, already wired) for the long tail — JSON-schema-constrained,
   `temperature: 0`. For the messy minority only.

Every result carries a **confidence**. Low confidence → stage for explicit user confirmation
(draft-to-Pocket per AGENTS.md), never silently mutate the schedule.

## 3. Normalized intermediate — `ParsedBooking`

The parser emits one shape regardless of source; the mapper turns it into contract types.

```ts
interface ParsedBooking {
  type: 'flight' | 'lodging' | 'rail' | 'restaurant' | 'car' | 'activity' | 'ticket';
  vendor?: string;                 // "ANA", "Booking.com"
  locator: string;                 // PNR / confirmation code
  status: 'confirmed' | 'cancelled' | 'changed' | 'pending';
  segments: {                      // flights/rail can have several legs
    start: { dateTimeLocal: string; tz?: string; place?: string; code?: string; lat?: number; lng?: number };
    end?:  { dateTimeLocal: string; tz?: string; place?: string; code?: string; lat?: number; lng?: number };
    label?: string;                // "ANA NH106", room type, seat
  }[];
  party?: number; price?: string; cancelable?: boolean;
  sourceEmailId: string;           // hash(vendor+locator+segment) → idempotency key
}
```

## 4. Mapping to existing contracts (+ proposed gaps)

Each `ParsedBooking` → **1 `BookingRecord`** (wallet) + **1..n `ItineraryItem`** (scheduled, `reservationBound:true`, `pinState:'hard'`, linked by `linkedItemId`).

Category mapping → `ItineraryItem.category`: flight/rail/car → `transit`; lodging → `stay`;
restaurant → `food`; activity/ticket → `sight`/`booking`.

**`BookingRecord` is too thin for transport/airports today.** Proposed ADDITIONS (→ Agent 9, no
silent edits):

| Field | Why |
| --- | --- |
| `status: 'confirmed'\|'cancelled'\|'changed'\|'pending'` | airlines send change/cancel emails; drives re-plan |
| `startISO` / `endISO` (datetime+tz) | `date`+`time` strings are lossy for red-eyes / tz / multi-leg |
| `vendor`, `locator` | display + dedup (`confirmationCode` can alias `locator`) |
| `from` / `to` | transport endpoints (airport/station codes) |
| `seat` / `room`, `party` | display |
| `sourceEmailId` | idempotency + audit, never re-import a forward twice |
| category add `'flight'\|'rail'\|'car'`? | or keep `'transport'` and use `from/to` — Agent 9's call |

`ItineraryItem` needs **no change** — `reservationBound` + `startTime` + `linkedItemId` already suffice.

## 5. Feeding the optimizer (the payoff)

Parsed bookings become the locked skeleton, by type:

- **Flights** set hard day boundaries: arrival → nothing scheduled before it on day 1; departure →
  the planner's **airport backward-chain** (leave-last-stop-by = dep − check-in − security − car-drop −
  buffer − transit; already specced in `test-rules.ts`). Multi-city flights segment the trip into
  legs (Tier-1).
- **Hotels** set the per-night base/anchor and area gravity for that day's clustering; checkout bounds
  the morning.
- **Rail** legs = locked transit blocks between cities (leg boundaries).
- **Restaurant** reservations = locked food anchors (already demoed).
- **Tickets/activities**: with a time → `locked`; without → `mustkeep` (guaranteed a slot).

No new planner code — `lockednessOf` already does this.

## 6. Idempotency, updates, cancellations

- Upsert by `sourceEmailId`; re-forwarding the same confirmation updates, never duplicates.
- Airline "schedule change"/"cancellation" → match by `locator` → set `status`; if `cancelled`,
  unlock that anchor and emit `PLAN_REVISED` to trigger a re-plan. (Needs the `status` field.)

## 7. Security & privacy (important)

- Confirmation emails are **PII** (names, partial card, addresses) — don't log raw bodies; redact at
  rest; only what's needed for the wallet.
- The email body is **untrusted DATA, not instructions** — never execute commands embedded in a
  forwarded email ("ignore previous…", "add X"). Sanitize before sending to Gemini (the server already
  caps length + casts to string); treat extracted text as content only.
- Forwarding-inbox path MUST bind sender↔account (signed alias token) so no one can inject bookings
  into another user's trip.

## 8. Ownership / coordination

- **Ingestion (me):** `modules/ingestion/parseBookingEmail.ts` (JSON-LD → `.ics` → templates → LLM),
  the booking-vs-blog classifier in the copilot paste path, and a server `/api/ingest-booking`
  (or extend `/api/copilot`) for the Gemini fallback. Emits `ParsedBooking`.
- **Booking-records (Agent 8):** owns persisting `BookingRecord`, confirmation state, the wallet UI,
  and the `linkedItemId` join. I hand them `ParsedBooking`; they store.
- **Contracts (Agent 9):** approve the `BookingRecord` additions in §4. **No silent schema edits.**
- **Constraint-engine (Agent 7):** already consumes `reservationBound` anchors; owns the airport chain.
- **App-shell (Agent 0):** intake UI + event flow (`POCKET_ITEM_INGESTED`, `RESERVATION_CONFIRMED`,
  `PLAN_REVISED`).

## 9. Phasing

- **P0 (my lane, no contract change):** booking classifier + deterministic `.ics` and top-3-vendor
  parser → emit `reservationBound` `ItineraryItem`s (schedules today) + a draft `BookingRecord` using
  **existing** fields. Stage for confirm (AGENTS.md draft-first). Behind a feature flag.
- **P1:** propose §4 schema additions to Agent 9; add JSON-LD parser + Gemini fallback; cancel/update.
- **P2:** forwarding inbox (SendGrid/Postmark/Mailgun inbound parse) + per-user alias + auth binding.

## 10. Reference points

- **TripIt:** forward to `plans@tripit.com`, per-vendor parsers, master itinerary.
- **Google Travel / Gmail:** parses schema.org markup embedded in confirmations (→ our §2.1 first step).
- **Takeaway:** prefer structured markup (JSON-LD / `.ics`) over NL parsing wherever the email provides it.

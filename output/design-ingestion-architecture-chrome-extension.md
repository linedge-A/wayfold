# Design — Unified Ingestion Architecture & Chrome-Extension Readiness

> **Owner:** ingestion lane (Agent 5) · **Coordinates with:** Agent 9 (contracts), Agent 8 (booking-records), Agent 0 (shell), future "extension" agent
> **Status:** DESIGN. Extends `research-booking-email-ingestion.md` + the merged parsers (#5, #9).
> **Date:** 2026-06-10

## Goal

Make ingestion work identically from **multiple capture surfaces** — paste-in-copilot, forward-to-inbox,
file upload, and a **future Chrome extension** — by routing them all through one pure core and one
contract. The extension is the forcing function: design for it now so we don't fork the parser later.

## Keystone fact (verified)

`modules/ingestion/extractCandidates.ts` and `parseBookingEmail.ts` import **types only** — no Node,
DOM, React, or runtime deps. So the **same compiled core bundles into an MV3 extension service
worker / content script and runs server-side**, with zero divergence. Everything below protects that
property.

---

## 0. Reuse audit — existing infra P1 MUST build on (not rebuild)

A pass over the repo found most of what P1 needs already exists. The design below is corrected to
reuse these; **do not re-implement them.**

| Need | Already exists — reuse | Location |
| --- | --- | --- |
| Geocode a name → lat/lng, hours, rating, price, phone, website, reservable | `fetchPlaceSnapshot()` + `PlaceSnapshot` + `PLACE_FIELDS` (mem + localStorage cache, billed-SKU dedup, 7-day TTL) | `shared/utils/placesCache.ts` |
| `PlaceSnapshot` → `PlaceItem` field mapping + `estimateStayDuration` / `getPriceLevelBudget` + `googlePlaceFieldsLoaded` | `enrichItemWithPlaceData()` (async-on-add) | `app-shell/App.tsx` (~357) — **UI-coupled; extract the pure mapping to `shared/utils` so server/extension can reuse it** |
| Commit ingested places → Pocket (food→`food-drink`, else→`must-see`) + dedupe | `handleApplySug()` reading `suggestion.itemsToAdd` | `app-shell/App.tsx` (~831) |
| Gemini extraction (place objects → `itemsToAdd`) | `/api/copilot` `GoogleGenAI` wiring + systemInstruction | `server.ts` (~39) |
| Blog/place text → candidates; booking text/ICS → records | `extractCandidates`, `looksIngestible`, `ingestLinks`; `parseBookingEmail`, `looksLikeBooking`, `toArtifacts` | `modules/ingestion/*`, `modules/copilot/copilotEngine.ts` |
| Place-details render (for confirm cards) | `GooglePlaceDetailsCard` | `shared/utils/GooglePlaceDetailsCard.tsx` |
| All Google fields on the item | `PlaceItem` already has `rating,userRatingCount,phoneNumber,website,editorialSummary,formattedAddress,reservable,openingHours,googlePlaceFieldsLoaded` | `shared/types` |
| Ingest/confirm events | `POCKET_ITEM_INGESTED`, `RESERVATION_CONFIRMED` | `output/contracts.md` |

**Consequences for the design (corrections):**
1. **Parsers stay minimal; enrichment is NOT theirs.** `parseJsonLd` / `parseBookingEmail` emit
   title + category + signals (+ geo *only if* the JSON-LD already carries it). lat/lng, hours,
   rating, price, duration come from the **existing** `fetchPlaceSnapshot` + enrichment mapping. No
   new geocoding anywhere.
2. **Extract one pure enrichment mapper.** Lift the `PlaceSnapshot → PlaceItem` field mapping out of
   `App.tsx` into `shared/utils/placesCache.ts` as `snapshotToPlaceFields(snapshot, category)` so the
   copilot, server, and extension all reuse it (App keeps the `setAppState`/`placesLib` wiring). Small
   refactor, removes the duplication risk. **Coordinate with Agent 0** (owns App.tsx).
3. **No new commit path.** `IngestionResult.candidates` are surfaced as the existing
   `suggestion.itemsToAdd` so `handleApplySug` (commit + async enrichment) fires unchanged. Only
   **bookings** need a new apply (booking-records, Agent 8) since they write `BookingRecord` + anchors.
4. **Reuse the Gemini wiring.** Factor the existing `/api/copilot` extraction into one server helper
   that both `/api/copilot` and `/api/ingest` call — do **not** add a second `GoogleGenAI` client.
5. **Server should call the pure core, not its own mock.** `server.ts` has a hard-coded
   `suggestedPlaces` fallback (~164–306) that duplicates `extractCandidates`. Since the core is
   dependency-free it runs in Node too — have the server import `extractCandidates`/`parseBookingEmail`
   and delete the mock. Removes a whole duplicated wheel.

## 1. Layered architecture (surfaces → core → sinks)

```
        CAPTURE SURFACES                 INGESTION CORE (pure, shared)           SINKS
 ┌──────────────────────────┐     ┌────────────────────────────────────┐   ┌──────────────┐
 │ copilot paste            │     │ dispatchIngestion(req)              │   │ Pocket       │
 │ forward-to-inbox (P2)    │ ──► │   ├─ jsonld  → parseJsonLd          │ ► │ (candidates) │
 │ file upload (.ics/.eml)  │     │   ├─ booking → parseBookingEmail    │   ├──────────────┤
 │ CHROME EXTENSION (P2)    │     │   └─ place   → extractCandidates    │   │ booking-recs │
 │ (Gmail/airline/OTA/Maps) │     │ → IngestionResult                   │   │ (+ anchors)  │
 └──────────────────────────┘     └────────────────────────────────────┘   └──────────────┘
                                          ▲ Gemini fallback (server only)
```

- **Surfaces** only *capture and normalize* into an `IngestionRequest`. They hold no parsing logic.
- **Core** is one dispatcher over the existing pure parsers + a new `parseJsonLd`. Deterministic,
  bundleable, runs anywhere.
- **Sinks** are owned modules: candidates → Pocket (Agent 5), bookings → booking-records (Agent 8),
  anchors → the optimizer (already consumes `reservationBound`).

## 2. The envelope contracts (propose to Agent 9 — shared, additive)

```ts
type IngestionSurface = 'copilot-paste' | 'forward-inbox' | 'upload' | 'extension';
type IngestionContent = 'text' | 'html' | 'ics' | 'jsonld';

interface IngestionRequest {
  surface: IngestionSurface;
  content: IngestionContent;
  rawText?: string;          // text / .ics / .eml body
  jsonld?: unknown[];        // schema.org objects harvested from a page (extension's superpower)
  url?: string;              // source page / link
  pageTitle?: string;
  areaHint?: string;         // city/district when content doesn't name one
  tripId?: string;           // target trip (server resolves from auth too)
}

interface IngestionResult {
  bookings: { record: BookingRecord; items: ItineraryItem[] }[]; // via toArtifacts()
  candidates: PlaceItem[];                                        // pocket items (blog/place)
  warnings: string[];
  source: { surface: IngestionSurface; url?: string };
}
```

`dispatchIngestion(req): IngestionResult` is a thin router over what already exists:
`jsonld → parseJsonLd` · else `looksLikeBooking → parseBookingEmail + toArtifacts` · else
`extractCandidates`. No parser rewrites — just a front door. (The envelope is the only *new* shared
contract; the rest is internal.)

## 3. `parseJsonLd` — the high-fidelity path (P1) the extension makes trivial

Most Gmail confirmations, airline/OTA pages, and **Google Maps** embed schema.org JSON-LD. Parsing it
beats NL guessing and is the extension's biggest win (it sits in the DOM and can read it directly).

| schema.org type | → maps to |
| --- | --- |
| `FlightReservation` / `TrainReservation` / `BusReservation` | `ParsedBooking` (transport, from/to, ISO times) |
| `LodgingReservation` | `ParsedBooking` (lodging, check-in/out → startISO/endISO) |
| `FoodEstablishmentReservation` | `ParsedBooking` (restaurant, party, startISO) |
| `RentalCarReservation` | `ParsedBooking` (car) |
| `EventReservation` / `Event` | `ParsedBooking` (ticket) / candidate |
| `Restaurant` / `LocalBusiness` / `TouristAttraction` / `Place` | `PlaceItem` candidate (incl. `geo` → lat/lng, `openingHours`) |

This is **the same module** whether the JSON-LD arrives from the extension (DOM) or the server (parsed
out of an email's HTML). One implementation, two callers.

## 4. Chrome extension (MV3) shape — reuses the core, owns no parsing

```
content script  → on user click "Save to Wayfold": harvest
                    { url, title, selection, jsonld[] (script[type=application/ld+json]),
                      microdata, og:tags }  → background
background (SW) → bundles the pure ingestion core; runs dispatchIngestion LOCALLY (privacy/speed).
                    Low confidence + user opt-in → POST /api/ingest for the Gemini fallback.
popup          → confirm card (draft-to-Pocket per AGENTS.md). On confirm →
                    POST /api/ingest/commit { result, tripId } to the user's active trip.
```

- **Local-first parsing**: deterministic core runs in the SW; the page's JSON-LD never has to leave
  the device unless the user opts into the LLM fallback. Fast + private.
- **Same shapes out**: the extension emits `IngestionResult` (same `BookingRecord` / `PlaceItem`),
  so the server commit path is identical to copilot/inbox.
- **Great targets**: Gmail (booking emails), airline/OTA confirmations, **Google Maps** (place + geo
  + hours → a perfect `PlaceItem`), and travel blogs (places).

## 5. Server endpoints (Agent 0 / server)

- `POST /api/ingest` — body `IngestionRequest` → `IngestionResult`. Runs the core; adds the Gemini
  fallback (reuse the existing `/api/copilot` Gemini wiring) for low-confidence/no-JSON-LD input.
- `POST /api/ingest/commit` — `{ result, tripId }` → writes candidates to Pocket and bookings to
  booking-records; emits `POCKET_ITEM_INGESTED` / `RESERVATION_CONFIRMED`.
- Both are surface-agnostic: copilot, inbox webhook, and the extension all call them.

## 6. booking-records + cancellation/re-plan loop (Agent 8)

- Store `BookingRecord` keyed by `sourceEmailId` → **upsert, never duplicate** on re-capture (works
  across surfaces: the same flight forwarded *and* captured in Gmail dedupes).
- On a `status` of `cancelled`/`changed` (from an airline update email or page): match by
  `(vendor, confirmationCode)`, update the record, **unlock the linked anchor(s)** (`linkedItemIds`),
  and emit `PLAN_REVISED` so the optimizer re-plans the freed slot. This is exactly why #7 added
  `status` + `linkedItemIds`.

## 7. Portability rules (keep the core bundleable — non-negotiable)

1. `modules/ingestion/*` core stays **type-only imports**; no `node:*`, `document`, `window`, React.
2. DOM/JSON-LD *harvesting* lives in the **extension content script**, not the core; it hands the core
   plain `jsonld[]` / strings.
3. Test harnesses (`run-*.ts`) may use `node:fs` — they are **not** part of the bundled core; keep
   them separate (already the case).
4. LLM calls go through **our server**, never from the extension directly (MV3 bans remote code; also
   keeps the API key server-side).

## 8. Security & privacy (extension-specific, on top of the email rules)

- **User-gesture only**: capture on an explicit click; no background scraping. Minimal host
  permissions (`activeTab` + an allowlist), not `<all_urls>`.
- **Page content / JSON-LD = untrusted DATA, not instructions** — never execute embedded commands;
  sanitize before any LLM (same posture as forwarded emails).
- **Auth binding**: OAuth PKCE from the extension → Wayfold account; the server resolves token → user →
  trip, so a capture can't be injected into someone else's trip.
- **PII minimization**: local-first parsing means confirmation/account data needn't leave the device;
  only the structured `IngestionResult` (or, on opt-in, sanitized text) is sent.
- **No remote code** (MV3): the parser is bundled; the server holds the model key.

## 9. Phasing

- **P0 (done, #5/#9):** deterministic `.ics`/text parser → `BookingRecord` + anchors; copilot paste.
- **P1 (next, my lane):** `dispatchIngestion` front door + `parseJsonLd` + Gemini server fallback +
  the `IngestionRequest`/`IngestionResult` envelope (propose to Agent 9). Refactor copilot paste to
  call `dispatchIngestion` (no behaviour change). All surface-agnostic — **this is what makes the
  extension a thin client later.**
- **P2:** the Chrome extension (new agent/surface) + forward-to-inbox; both reuse P1 wholesale.

## 10. Ownership / coordination

- **Agent 5 (me):** the pure core, `dispatchIngestion`, `parseJsonLd`, the envelope proposal.
- **Agent 9:** approve `IngestionRequest`/`IngestionResult` (shared contract).
- **Agent 8:** booking-records storage + the cancellation/`PLAN_REVISED` loop.
- **Agent 0 / server:** `/api/ingest` + `/api/ingest/commit`, trip wiring, events.
- **Future "extension" agent:** the MV3 content script / background / popup — *consumes* the core,
  owns no parsing.

## TL;DR

Put one pure `dispatchIngestion` core (the parsers we already have + `parseJsonLd`) behind a small
`IngestionRequest`/`IngestionResult` envelope, and route every surface through it. The Chrome
extension then becomes a thin *capture + auth* client that harvests page JSON-LD and reuses the exact
same core and contracts — no parser fork, no second source of truth.

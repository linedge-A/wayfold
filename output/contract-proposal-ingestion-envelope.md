# Contract Proposal — graduate `IngestionRequest` / `IngestionResult` to `shared/types`

> **Proposer:** ingestion lane (Agent 5) · **Owner/approver:** Agent 9 (`shared/types`)
> **Affects:** Agent 0 (server / `/api/ingest`), future extension surface
> **Status:** PROPOSAL — needs Agent 9 approval before editing `shared/types/index.ts`.
> Filed per `agent.md` Rule 2. No code merged by this note.
> **Date:** 2026-06-10

## Why

The ingestion **envelope** is the surface-agnostic contract every capture surface speaks. It's now
consumed by **two surfaces** already and a third is coming:

- `modules/ingestion/dispatchIngestion.ts` (the front door, merged in #13)
- `server.ts` `POST /api/ingest` (PR #20)
- the future Chrome extension / forward-to-inbox webhook (P2)

Today the two interfaces live **module-local** in `dispatchIngestion.ts`. With more than one lane
consuming them, they should graduate to the canonical home so surfaces don't drift. (Same rationale
as `BookingRecord` extension #7 — promote once shared.)

## Current shape (module-local, proven in #13/#20 — move verbatim)

```ts
export type IngestionSurface = 'copilot-paste' | 'forward-inbox' | 'upload' | 'extension';
export type IngestionContent = 'text' | 'html' | 'ics' | 'jsonld';

export interface IngestionRequest {
  surface: IngestionSurface;
  content?: IngestionContent;
  rawText?: string;          // text / .ics / .eml body
  jsonld?: unknown[];        // schema.org nodes harvested from a page (extension) or email HTML
  url?: string;
  pageTitle?: string;
  areaHint?: string;
  sourceType?: PlaceItem['sourceType'];
}

export interface IngestionResult {
  bookings: { record: BookingRecord; items: ItineraryItem[] }[];
  candidates: PlaceItem[];
  warnings: string[];
  source: { surface: IngestionSurface; url?: string };
}
```

## Proposed change (additive, backward-compatible)

1. **Move both interfaces + the two string-literal types verbatim into `shared/types/index.ts`.**
   No field changes — they already reference `PlaceItem` / `BookingRecord` / `ItineraryItem`, all in
   that file.
2. `dispatchIngestion.ts` and `server.ts` **import them from `shared/types`** instead of defining
   them; the module-local copies are deleted in the same PR (no duplicate truth).

### Decisions for Agent 9
- **`tripId?`**: add a `tripId?: string` to `IngestionRequest` for the server commit path (which trip
  a capture targets), or resolve trip server-side from auth only? I lean: add optional `tripId?`.
- **`bookings` element type**: inline `{ record: BookingRecord; items: ItineraryItem[] }` — promote to
  a named `BookingArtifact` interface? (Reads cleaner; `applyBookings` in #17 already uses that shape.)
- **`source` block**: keep as-is, or widen later for audit (timestamp, sourceEmailId)? Optional now.

## Migration / blast radius

- **Additive + a move** → zero behaviour change. Only consumers are mine (`dispatchIngestion`,
  `server.ts`) plus PR #20; both repoint imports in the same PR. No runtime effect.
- No existing field changes type; nothing becomes required.

## What I need from you (Agent 9)

1. Approve the move (and the `BookingArtifact` / `tripId?` decisions).
2. On approval, you add them to `shared/types`; I repoint `dispatchIngestion.ts` + `server.ts` and
   delete the local copies.

Until then, the module-local definitions keep working — nothing is blocked.

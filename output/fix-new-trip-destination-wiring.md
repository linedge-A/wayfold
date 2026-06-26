# Fix — new trip stuck on Kyoto (destination not wired to places + map)

> **Symptom:** Creating a new trip (e.g. Paris) "can't find the correct place" and the map still
> shows Kyoto — the destination isn't honoured.
> **Owner touchpoints:** Agent 2 (`trip-brief`), Agent 4 (`map`), Agent 0 (`app-shell`).
> **Status:** A + B applied in this PR (verified). C is a scoped follow-up.

## Root cause — three compounding bugs

| # | Where | Bug |
|---|---|---|
| **A** | `modules/trip-brief/placeItemsToPool.ts` | Empty pocket fell back to `SAMPLE_POOL` (Kyoto demo places) → a new trip is scheduled with Kyoto temples regardless of destination. |
| **B** | `modules/map/MapPanel.tsx` `getLatLng` | Coordinate gate was **Japan-only** (`lat 30–46, lng 125–146`); any other region was rejected and snapped to Kyoto center. |
| **C** | `app-shell/App.tsx` `handleGenerated` | Unlike the add/insert paths, generation never fires Google Place enrichment, so generated items never get real coordinates. |

The destination *is* set correctly (`briefFromForm` → `tripBrief.destination`, spread in `handleGenerated`); A/B/C are why it doesn't reach places or the map.

## Fix A — don't inject Kyoto demo into a real trip  *(applied)*

```diff
- import { SAMPLE_POOL } from './samplePool';
  ...
-   return pool.length ? pool : (opts.fill ?? SAMPLE_POOL);
+   // Empty pocket → an empty pool, so a NEW trip reflects its real destination (the user fills it
+   // via copilot/ingestion) instead of being injected with the Kyoto-specific SAMPLE_POOL demo set.
+   return pool.length ? pool : (opts.fill ?? []);
```
**Verified:** empty pocket → `0` items (no Kyoto); Paris pocket → `Louvre`. Callers wanting the demo still pass `fill` explicitly.

## Fix B — accept real coordinates anywhere on Earth  *(applied)*

```diff
- // Check if Coordinates are valid Japan/Kyoto coordinates and not double-digit placeholder mocks
- if (item.lat !== undefined && item.lng !== undefined && item.lat > 30 && item.lat < 46 && item.lng > 125 && item.lng < 146) {
-   return { lat: item.lat, lng: item.lng };
- }
+ // Real, Google-enriched coords are valid ANYWHERE (lat ±90, lng ±180) — not Japan-only.
+ // `googlePlaceFieldsLoaded` separates real geocoded coords from normalized placeholder seeds.
+ const realGeo = item.lat != null && item.lng != null && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180;
+ if (realGeo && (item as any).googlePlaceFieldsLoaded) {
+   return { lat: item.lat as number, lng: item.lng as number };
+ }
```
`MapBoundsFitter` already fits to the markers, so once real markers exist the map centers correctly. Reuses the same real-vs-placeholder signal as `PocketPanel.isGeo` (#16).

## Fix C — the residual  *(NOT applied — scoped follow-up)*

Two gaps remain after A + B:

1. **Enrich generated items.** `handleGenerated` (App.tsx ~78) should fire the same async Google
   enrichment the add/insert paths use (`enrichItemWithPlaceData`) for each newly scheduled item, so
   pocket items that lack real coords get geocoded and thus pass Fix B's `googlePlaceFieldsLoaded`
   gate. Without this, a generated item with only placeholder coords won't render at its real spot
   until separately enriched.
2. **Empty-trip map center.** An *empty* new trip has no markers → `MapBoundsFitter` does nothing →
   the hardcoded `defaultCenter` (`{35.0116,135.7681}` Kyoto, MapPanel ~290) shows. Geocode
   `tripBrief.destination` once (via the Places lib) and feed it as the map's center/`defaultCenter`
   when there are no markers, so a brand-new empty Paris trip opens on Paris.

Both are small and belong with Agent 0 (App enrichment wiring) + Agent 4 (map default center).

## How to verify in the real app

The deterministic harness covers A. Full verification needs the **Wayfold** dev server (`wayfold-dev`,
port 3100) **with a Google Maps API key** — the running preview during this work was a *different*
project (FirstStep), so the map couldn't be exercised here. Steps: create a new non-Kyoto trip with a
few saved places → confirm the scheduled stops + map are in the destination, not Kyoto.

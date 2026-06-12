# Handover — Phase 3: Generate the itinerary *from* the Research Pocket

**From:** pocket/map work (Agents 4 & 5)
**To:** Agent 2 (trip-brief / generation) — primary · Agent 7 (constraint-engine) — only if scoring/day-assignment needs tuning · Agent 0 (shell) — one prop thread
**Status:** ✅ **IMPLEMENTED** (this PR). Phases 1, 2, 4 were already merged; Phase 3 (the seam) is now wired end-to-end.
**Owner of this doc:** hand-off note — Agent 0 to link from `agent.md` if kept.

---

## ✅ Implemented in this PR

The seam is closed — "Plan new trip" now generates **from the user's Research Pocket**, not `SAMPLE_POOL`.

| Piece | File | Notes |
|---|---|---|
| `PlaceItem[] → EngineItem[]` mapper | `modules/trip-brief/placeItemsToPool.ts` | flattens pocket columns, **dedups against the board** (`scheduledIds`), carries `signals`/`stopClass`/`priority`/`tags`, drops `group`; **empty pocket → sample fallback** (never an empty trip) |
| Prop thread | `app-shell/App.tsx` → `app-shell/TopHeader.tsx` → `PlanInitiateModal pool` | App builds the pool from `appState.pocket` (minus already-scheduled) and passes it down |
| Result → board | `app-shell/App.tsx` `handleGenerated` | flattens the generated day buckets into flat `itineraryItems`, builds `itineraryDays` metadata, sets the active day, and **removes scheduled POIs from the pocket** (overflow stays) |
| Verification | `modules/trip-brief/run-pocket.ts` | must-sees land · `skip`-verdict excluded · already-scheduled deduped · empty→fallback — all green. `tsc` clean (baseline 3 `ErrorBoundary` errors only); `vite build` passes |

**Deliberate scope notes:** sample top-up only fires for an *empty* pocket (the sample is Kyoto-specific demo data — blending it into a real non-Kyoto pocket would mix unrelated places); a "Regenerate on an active trip" action that honours the Itinerary-Stability guardrail (pinned/locked stay put) remains future work and belongs to the constraint-engine replanning path, not this from-scratch generate.

---

## TL;DR — the whole feature is one seam

Generation **already takes a candidate `pool`** and **already scores on ingestion signals**; it just isn't fed the user's pocket. Today:

```
modules/trip-brief/PlanInitiateModal.tsx:54
  const r = generateFromForm({ destinations, dateRange, groupSize, style, notes }, pool ?? SAMPLE_POOL);
```

`pool` is a prop that is never passed, so it falls back to `SAMPLE_POOL` (a hardcoded demo set). **Phase 3 = pass the user's accumulated pocket (mapped to `EngineItem[]`) as that `pool`.** Everything downstream already works.

---

## What's already built (don't rebuild it)

| Capability | Where | Note |
|---|---|---|
| Pocket accumulates + persists per trip | `app-shell/App.tsx` (`appState.pocket`), `shared/utils/persistence.ts` | Phase 4, merged |
| Ingestion extracts POIs **with signals** | `modules/ingestion/extractCandidates.ts` | `signals.verdict` (`must/recommended/mixed/skip`), `signals.bestTime`, `priority`, `stopClass`, `tags`, `openingHours` |
| Pocket organizing field | `PlaceItem.group` (`shared/types/index.ts`) | added in #10; for pocket filing, not geography |
| Generation takes a pool → days + overflow | `modules/trip-brief/generateFromBrief.ts:140` `generateFromBrief(brief, pool, opts)` | returns `{ itineraryDays, pocket: overflow, flags, notes }` |
| **Scoring already uses signals** | `generateFromBrief.ts:64` `itemScore = PRIORITY_W[priority] + VERDICT_W[signals.verdict]` | pocket items that carry ingestion signals get ranked for free |
| Area clustering → day assignment | `generateFromBrief.ts` `routeOrderedAreas` / `clusterAssignDays` | groups by `area`, orders the route, fills days |
| **Overflow already returns to the pocket** | `GenerateResult.pocket` | the un-scheduled remainder is meant to flow back |
| Modal accepts a `pool` prop | `PlanInitiateModal.tsx:20` `pool?: EngineItem[]` | the injection point already exists |

`EngineItem` (`modules/constraint-engine/planner.ts:29`) is a superset of `PlaceItem`: `id, title, category, area, lat, lng, priority, tripRole, pinState, stopClass, openingHours, signals{verdict,bestTime}, …`. Mapping `PlaceItem → EngineItem` is a near-direct field copy.

## What Phase 3 actually needs

1. **Write `PlaceItem[] → EngineItem[]` mapper.** No mapper exists yet. Carry: `id, title, category, area, lat, lng, priority, tripRole, stopClass, openingHours` and **`signals`** (so `itemScore` ranks by verdict/best-time). Suggested home: `modules/trip-brief/` (it owns the generation entry) or a small shared mapper. Note `EngineItem` has no `group` field — `group` is a pocket-filing label; the planner clusters on `area`, so map `area → area`.

2. **Thread the pocket into the modal's `pool`.** `PlanInitiateModal` is mounted at `app-shell/TopHeader.tsx:139` with **no `pool` passed**. Chain: `App.tsx` (owns `appState.pocket`) → `TopHeader` → `PlanInitiateModal pool={placeItemsToPool(appState.pocket)}`. (Agent 0 threads the prop.)

3. **Decide the blend (a real product call, see below).**

4. **Flow overflow back to the pocket** after generate, instead of discarding it (the result already carries it).

That's it. `itemScore`, area clustering, persona/group-size mapping (`generateFromForm`), and overflow are done.

## Decisions the receiving agent must make

- **Empty / thin pocket** → fall back to `SAMPLE_POOL`, or blend pocket + sample? Recommend: pocket-first, top up with sample only when the pocket can't fill the day count. Never generate an empty trip.
- **Regenerate on an *existing* trip vs only at "Plan new trip".** Generation today lives in the new-trip modal. A "Regenerate from pocket" action on an active trip must respect the **AGENTS.md "Itinerary Stability"** guardrail (pinned/locked items stay put) — that's closer to the constraint-engine's replanning path (Agent 7) than a from-scratch generate.
- **Dedup:** a pocket item already scheduled on the board shouldn't be re-proposed — filter by `itineraryItems` ids before building the pool.
- **`skip`-verdict items:** ingestion keeps them; generation should weight them out (VERDICT_W already handles this — just confirm they don't get scheduled).

## Known limitations / gotchas

- **Pocket items often lack real `lat/lng`** (ingested items aren't geocoded until Google enrichment; seed coords are normalized placeholders). The planner already degrades to `area`-string clustering, so this is fine — but don't build day-assignment that *requires* coordinates. (Context: PR #16 fixed a relevance bug that came from treating placeholder coords as real — same trap.)
- **No new shared contract is required.** `EngineItem` already carries `signals`; `PlaceItem.group` already exists. If you add anything to `shared/types`, that's an Agent 9 contract notice (Rule 2).
- Generation is **synchronous** (`generateFromBrief`); the modal fakes a "crafting" delay. Feeding a large pocket is still cheap.

## Suggested verification

- Add a harness like the existing `modules/trip-brief/run-form.ts`, but pass a **pocket-derived pool** (incl. a few `verdict: 'must'` items) and assert the must-sees land on days and the rest come back as overflow.
- Reuse the Iceland fixture (`shared/mock-data/icelandFamilyTrip.ts`, real coords) to prove area clustering across a multi-day road trip.
- `tsc --noEmit` (baseline has 3 known pre-existing `ErrorBoundary` errors in `app-shell/App.tsx` — unrelated); contract suite: `npm test` + the booking/iceland contract tests.

## Demo state

On `main` today: paste research → POIs accumulate in the pocket (grouped by area/day, day-relevant ones surfaced, persisted per trip). "Plan new trip" generates from `SAMPLE_POOL`, **ignoring** what the user saved. Phase 3 closes that loop: plan **from my research**.

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agent 2 — "Regenerate from pocket": re-plan an EXISTING trip, folding in fresh Research-Pocket
 * finds, WITHOUT disturbing the user's fixed items. A thin wrapper over the engine — no new scheduler.
 *
 * Reuse map (everything here already exists; this only orchestrates it):
 *  - Itinerary Stability comes free from the engine's lockedness tiers (planner.ts:133-137):
 *    bookings / hard-pins (`locked`) keep their exact day + time; soft-pins (`mustkeep`) keep a
 *    slot; only `flexible` items are re-timed / re-ordered.
 *  - `brief.keepAll` (planner.ts:144,182) = "re-time/re-order, never drop curated stops" — it removes
 *    the pace cap so curated flexibles aren't shed (time-infeasible days still overflow, honestly).
 *  - `placeItemsToPool()` builds the fresh-pocket candidates, deduped against the board.
 *
 * Returns a MERGE-friendly result (flat re-placed items + overflow) for Agent 0 to fold into App
 * state: keep fixed items byte-for-byte, swap only flexibles, send overflow back to the pocket.
 * (Board items round-trip with their `pinState` / `reservationBound` / identity intact, so the merge
 * keys on the same public fields it already uses for stability — no engine internals leak out.)
 */
import { generateItinerary, type EngineItem, type Persona } from '../constraint-engine/planner.ts';
import { placeItemsToPool, type PocketItem } from './placeItemsToPool';

export interface RegenerateInput {
  board: EngineItem[];                 // current itinerary items (carry dayId, pinState, startTime, …)
  pocket: { items?: PocketItem[] }[];  // fresh Research Pocket
  dayIds: string[];                    // the trip's existing day ids (regenerate keeps the day frame)
  brief?: { style?: string; persona?: Persona; interests?: string[] };
}
export interface RegenerateResult {
  itineraryItems: EngineItem[]; // re-placed board, flat — each carries dayId / startTime / endTime
  pocket: EngineItem[];         // overflow → back to the Research Pocket (never silently dropped)
  flags: string[];
  notes: string[];
}

export function regenerateFromPocket(input: RegenerateInput): RegenerateResult {
  const brief = input.brief ?? {};
  const boardIds = new Set(input.board.map(b => String(b.id)).filter(Boolean));

  // Fresh pocket candidates only (deduped vs the board). No SAMPLE fallback here — unlike a
  // from-scratch generate, the board is the floor, so an empty pocket just re-tidies what exists.
  const fresh = placeItemsToPool(input.pocket, { scheduledIds: boardIds, fill: [] });
  const pool: EngineItem[] = [...input.board, ...fresh];

  // keepAll re-times/re-orders around the frozen locked/pinned skeleton without dropping curated stops.
  const r = generateItinerary({
    brief: { style: brief.style, persona: brief.persona ?? 'default', interests: brief.interests, keepAll: true },
    dayIds: input.dayIds,
    pool,
  });

  return { itineraryItems: r.scheduled, pocket: r.overflow, flags: r.flags, notes: r.notes };
}

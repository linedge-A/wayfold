/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agent 2 — Phase 3: generate the itinerary FROM the Research Pocket.
 *
 * Maps the user's accumulated pocket (PlaceItem[] + the non-contract fields ingestion attaches)
 * onto the engine's candidate pool. Generation already scores on `signals` and returns overflow to
 * the pocket — this mapper is the one missing seam between "what the user saved" and the planner.
 */
import type { PlaceItem } from '../../shared/types/index';
import type { EngineItem } from '../constraint-engine/planner.ts';

/** Pocket items are structurally PlaceItem plus the extras ingestion attaches (IngestedCandidate):
 *  `signals` (verdict/bestTime), `stopClass`, `priority`. We read those so the planner can rank. */
export type PocketItem = PlaceItem & {
  signals?: { verdict?: string; bestTime?: string;[k: string]: unknown };
  stopClass?: 'anchor' | 'destination' | 'corridor';
  priority?: string;
  pinState?: string;
};

export interface PoolOptions {
  scheduledIds?: Iterable<string>; // ids already on the board — don't re-propose them
  fill?: EngineItem[];             // fallback when the pocket yields nothing (default: empty — no demo injection)
}

/** One PlaceItem → one EngineItem. Near-direct field copy that carries `signals`/`stopClass`/
 *  `priority`/`tags` so the engine ranks by verdict, best-time and remembered interests. `group` is
 *  intentionally dropped — it is a pocket-filing label; the planner clusters geography on `area`. */
export const placeItemToEngine = (p: PocketItem): EngineItem => ({
  id: p.id,
  title: p.title,
  category: p.category,
  area: p.area,
  lat: p.lat,
  lng: p.lng,
  estimatedDurationMin: p.estimatedDurationMin,
  priority: p.priority,
  tripRole: p.tripRole,
  stopClass: p.stopClass,
  openingHours: p.openingHours,
  reservationBound: p.reservationBound,
  pinState: p.pinState,
  tags: p.tags,
  signals: p.signals,
  // Carry Google enrichment through so a server-resolved place (exact coords + placeId from
  // /api/discover) keeps its data and the client's by-name re-search is skipped (googlePlaceFieldsLoaded).
  placeId: (p as any).placeId,
  rating: p.rating,
  userRatingCount: p.userRatingCount,
  website: p.website,
  formattedAddress: p.formattedAddress,
  googlePlaceFieldsLoaded: p.googlePlaceFieldsLoaded,
});

/**
 * Flatten the pocket columns into a generation pool: skip already-scheduled items (dedup against the
 * board), de-duplicate ids, map to EngineItem, and fall back to `fill` (the sample demo set) ONLY
 * when the pocket is empty — so we plan from the user's research but never generate an empty trip.
 * (`skip`-verdict items are kept; the engine weights them out via VERDICT_W and never schedules them.)
 */
export function placeItemsToPool(pocket: { items?: PocketItem[] }[] | undefined, opts: PoolOptions = {}): EngineItem[] {
  const scheduled = new Set(opts.scheduledIds ?? []);
  const seen = new Set<string>();
  const pool: EngineItem[] = [];
  for (const col of pocket ?? []) {
    for (const it of col?.items ?? []) {
      if (!it?.id || scheduled.has(it.id) || seen.has(it.id)) continue;
      seen.add(it.id);
      pool.push(placeItemToEngine(it));
    }
  }
  // Empty pocket → an empty pool, so a NEW trip reflects its real destination (the user fills it
  // via copilot/ingestion) instead of being injected with a hardcoded demo set (the old Kyoto
  // sample pool, which produced "Kyoto temples in a Paris trip"). Callers wanting a fallback pass
  // `fill` explicitly.
  return pool.length ? pool : (opts.fill ?? []);
}

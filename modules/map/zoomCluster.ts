/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * zoomCluster — provider-agnostic level-of-detail aggregation for map points.
 *
 * Ported & generalized from Edgeland's junior renderer (`src/map/zoomCluster.ts`).
 * That version collapsed points into predefined district POLYGONS; Wayfold has no
 * global gazetteer, so this version clusters points on a coordinate GRID instead —
 * data-agnostic, works for any trip anywhere. Three tiers by zoom:
 *
 *   zoom <  cityZoom            → 'country' clusters (coarse grid) — shade + count
 *   cityZoom <= zoom < pinZoom  → 'city'    clusters (fine grid)   — dot + count (# of POI)
 *   zoom >= pinZoom             → 'pins'    (individual POIs, viewport-culled) — the in-city scatter
 *
 * Pure logic with no map/provider dependency, so the same mechanism drives the
 * Pocket Board map and the Trips map (and any future provider). A renderer feeds it
 * the current zoom + bounds on each map idle and draws whatever it returns.
 */

export type Tier = 'country' | 'city' | 'pins';

/** Minimal shape a clusterable point must provide. `label` (e.g. area/city) names the cluster. */
export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

export interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Cluster<T extends ClusterPoint> {
  key: string;                          // grid-cell key (stable across renders at the same tier)
  label: string;                        // dominant member label, or a "N places" fallback
  count: number;                        // # of POI in the cluster (what the dot shows)
  centroid: { lat: number; lng: number };
  items: T[];
}

export interface ZoomClusterResult<T extends ClusterPoint> {
  tier: Tier;
  clusters: Cluster<T>[];               // populated for 'country' | 'city' (sorted by count desc)
  pins: T[];                            // populated for 'pins' (viewport-culled)
}

export interface ZoomClusterOptions {
  /** Below this zoom → 'country' tier. Default 5. */
  cityZoom?: number;
  /** At/above this zoom → 'pins' (individual scatter). Default 10. */
  pinZoom?: number;
  /** Coarse grid cell size (degrees) for the country tier. Default 8 (~continental). */
  countryCellDeg?: number;
  /** Fine grid cell size (degrees) for the city tier. Default 0.4 (~city-sized). */
  cityCellDeg?: number;
  /** Fractional viewport padding when culling pins (keeps edge pins on pan). Default 0.15. */
  boundsPadding?: number;
}

const isValid = (p: { lat?: number; lng?: number }): boolean =>
  p.lat != null && p.lng != null &&
  Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

const dominantLabel = <T extends ClusterPoint>(items: T[]): string => {
  const freq = new Map<string, number>();
  for (const p of items) if (p.label) freq.set(p.label, (freq.get(p.label) ?? 0) + 1);
  let best = '';
  let bestN = 0;
  for (const [label, n] of freq) if (n > bestN) { best = label; bestN = n; }
  return best || `${items.length} ${items.length === 1 ? 'place' : 'places'}`;
};

/** Group valid points into clusters on a `cellDeg` grid; centroid = mean of members. */
function clusterByGrid<T extends ClusterPoint>(points: readonly T[], cellDeg: number): Cluster<T>[] {
  const cells = new Map<string, T[]>();
  for (const p of points) {
    // floor to grid cell — points in the same cell aggregate together
    const gx = Math.floor(p.lng / cellDeg);
    const gy = Math.floor(p.lat / cellDeg);
    const key = `${gx}:${gy}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(p);
    else cells.set(key, [p]);
  }
  const out: Cluster<T>[] = [];
  for (const [key, items] of cells) {
    const lat = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng = items.reduce((s, p) => s + p.lng, 0) / items.length;
    out.push({ key, label: dominantLabel(items), count: items.length, centroid: { lat, lng }, items });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Decide what to draw for the current zoom + viewport.
 * Invalid-coordinate points are dropped (never invented onto the map).
 */
export function zoomCluster<T extends ClusterPoint>(
  points: readonly T[],
  zoom: number,
  bounds: LatLngBounds | null,
  options: ZoomClusterOptions = {},
): ZoomClusterResult<T> {
  const cityZoom = options.cityZoom ?? 5;
  const pinZoom = options.pinZoom ?? 10;
  const valid = points.filter(isValid);

  // In-city scatter: individual pins, culled to the (padded) viewport.
  if (zoom >= pinZoom) {
    let pins = valid;
    if (bounds) {
      const pad = options.boundsPadding ?? 0.15;
      const dLat = (bounds.north - bounds.south) * pad;
      const dLng = (bounds.east - bounds.west) * pad;
      const n = bounds.north + dLat;
      const s = bounds.south - dLat;
      const e = bounds.east + dLng;
      const w = bounds.west - dLng;
      pins = valid.filter((p) => p.lat <= n && p.lat >= s && p.lng <= e && p.lng >= w);
    }
    return { tier: 'pins', clusters: [], pins: pins as T[] };
  }

  // Aggregated: coarse 'country' shading far out, finer 'city' dots closer in.
  const tier: Tier = zoom < cityZoom ? 'country' : 'city';
  const cellDeg = tier === 'country' ? (options.countryCellDeg ?? 8) : (options.cityCellDeg ?? 0.4);
  return { tier, clusters: clusterByGrid(valid, cellDeg), pins: [] };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared cache for Google Places "searchByText" lookups.
 *
 * Places Text Search is a billed SKU, so we must never call it twice for the same
 * query. This module provides:
 *   1. An in-memory promise cache (dedupes concurrent + repeat calls in a session).
 *   2. A localStorage layer with a TTL (survives page reloads / HMR, so quota is not
 *      re-burned on every refresh during development).
 *   3. A single canonical field set + plain snapshot shape, so the enrichment path and
 *      the details card share one cache entry per place instead of calling separately.
 */

export interface PlaceSnapshot {
  displayName?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  editorialSummary?: string;
  weekdayDescriptions?: string[];
  todayHours?: string;
  priceLevel?: string;
  types?: string[];
  reservable?: boolean;
  photoUrl?: string;
}

// Canonical superset of fields both consumers need — one request covers everything.
export const PLACE_FIELDS = [
  'displayName',
  'formattedAddress',
  'rating',
  'userRatingCount',
  'regularOpeningHours',
  'websiteURI',
  'nationalPhoneNumber',
  'photos',
  'editorialSummary',
  'priceLevel',
  'types',
  'location',
  'reservable',
];

const LS_PREFIX = 'wayfold:place:v1:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const normalize = (query: string) => query.trim().toLowerCase().replace(/\s+/g, ' ');

// In-memory cache keyed by normalized query → resolved/in-flight snapshot (or null = not found).
const memCache = new Map<string, Promise<PlaceSnapshot | null>>();

function readFromStorage(key: string): PlaceSnapshot | null | undefined {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { t: number; v: PlaceSnapshot | null };
    if (!parsed || typeof parsed.t !== 'number') return undefined;
    if (Date.now() - parsed.t > TTL_MS) {
      localStorage.removeItem(LS_PREFIX + key);
      return undefined;
    }
    return parsed.v; // may be null (cached "not found")
  } catch {
    return undefined;
  }
}

function writeToStorage(key: string, value: PlaceSnapshot | null) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* quota / unavailable — ignore, in-memory cache still applies */
  }
}

function toSnapshot(p: any, fallbackName: string): PlaceSnapshot {
  const name = typeof p.displayName === 'string' ? p.displayName : p.displayName?.text ?? fallbackName;
  const summary = typeof p.editorialSummary === 'string' ? p.editorialSummary : p.editorialSummary?.text ?? undefined;
  const weekday: string[] | undefined = p.regularOpeningHours?.weekdayDescriptions ?? undefined;
  return {
    displayName: name,
    lat: typeof p.location?.lat === 'function' ? p.location.lat() : p.location?.lat,
    lng: typeof p.location?.lng === 'function' ? p.location.lng() : p.location?.lng,
    rating: p.rating ?? undefined,
    userRatingCount: p.userRatingCount ?? undefined,
    formattedAddress: p.formattedAddress ?? undefined,
    nationalPhoneNumber: p.nationalPhoneNumber ?? undefined,
    websiteUri: p.websiteURI ?? p.websiteUri ?? undefined,
    editorialSummary: summary,
    weekdayDescriptions: weekday,
    todayHours: weekday?.[0],
    priceLevel: p.priceLevel ?? undefined,
    types: p.types ?? undefined,
    reservable: p.reservable ?? undefined,
    photoUrl: p.photos && p.photos[0] ? p.photos[0].getURI({ maxWidth: 320 }) : undefined,
  };
}

/**
 * Returns a place snapshot for `query`, hitting the Places API at most once ever
 * (per session via memory, per 7 days via localStorage). `placesLib` is the object
 * from useMapsLibrary('places'); pass null to read cache-only.
 */
export function fetchPlaceSnapshot(placesLib: any, query: string): Promise<PlaceSnapshot | null> {
  const key = normalize(query);
  if (!key) return Promise.resolve(null);

  // 1. Persistent cache (also covers cached "not found" = null).
  const stored = readFromStorage(key);
  if (stored !== undefined) return Promise.resolve(stored);

  // 2. In-memory / in-flight cache.
  const existing = memCache.get(key);
  if (existing) return existing;

  // 3. No cache and no library → cannot fetch.
  if (!placesLib?.Place?.searchByText) return Promise.resolve(null);

  const promise = placesLib.Place.searchByText({
    textQuery: query,
    fields: PLACE_FIELDS,
    maxResultCount: 1,
  })
    .then(({ places }: { places: any[] }) => {
      const snap = places && places[0] ? toSnapshot(places[0], query) : null;
      writeToStorage(key, snap);
      return snap;
    })
    .catch((err: unknown) => {
      // Allow a later retry on transient failure — don't poison the cache.
      memCache.delete(key);
      throw err;
    });

  memCache.set(key, promise);
  return promise;
}

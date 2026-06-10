/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DEV-ONLY fake pocket generator for browse/filter stress testing (e.g. `?fake=200`).
 * Produces N PlaceItems spread across the 5 intent categories (See / Eat / Do / Stay /
 * Transit — see ./taxonomy) with their canonical sub-categories, plus BOOKED / BACKUP
 * status flags on a slice of items (statuses are tags, not categories). Coordinates are
 * real-ish, clustered around a handful of world regions so the map's zoom tiers have
 * something to aggregate. Every item carries inline rating/address/hours +
 * `googlePlaceFieldsLoaded`, so it renders fully WITHOUT any Google Places API call.
 */
import { PocketColumn, PlaceItem } from '@/shared/types/index';
import { DISPLAY_SUBS } from './taxonomy';

// Legacy-contract category per intent (display layer maps these back to See/Eat/Do/Stay/Transit).
// 'do' has no legacy slot yet — those ride as 'sight' with a Do sub-category until the
// Agent 9 contract migration lands; displayCategory() re-files them by keyword.
const CATS: { legacy: PlaceItem['category']; subs: string[] }[] = [
  { legacy: 'sight', subs: DISPLAY_SUBS.see },
  { legacy: 'food', subs: DISPLAY_SUBS.eat },
  { legacy: 'sight', subs: DISPLAY_SUBS.do },   // "Do" items — sub-category carries the intent
  { legacy: 'stay', subs: DISPLAY_SUBS.stay },
  { legacy: 'transit', subs: DISPLAY_SUBS.transit },
];
const AREAS = ['Higashiyama', 'Gion', 'Arashiyama', 'Central', 'Downtown', 'Old Town', 'Harbor', 'Uptown', 'Riverside', 'Hills', 'Marina', 'Bay Area'];
const BUDGETS = ['Free', '¥', '¥¥', '¥¥¥', '$$', '$$$'];
const TAGS = ['scenic', 'historic', 'foodie', 'family', 'hidden-gem', 'romantic', 'adventure', 'relaxing', 'cultural', 'nightlife'];
// Real city anchors so the zoom aggregation has multiple country/city clusters to draw.
const REGIONS = [
  { lat: 35.0116, lng: 135.7681 }, // Kyoto
  { lat: 64.1466, lng: -21.9426 }, // Reykjavík
  { lat: 48.8566, lng: 2.3522 },   // Paris
  { lat: -33.8688, lng: 151.2093 },// Sydney
  { lat: 40.7128, lng: -74.0060 }, // New York
];

// Deterministic LCG so the same N always yields the same fixtures (stable across reloads).
let _seed = 0x2f6e2b1;
const rand = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

/** N fake PlaceItems across every intent, in two storage columns (PocketPanel flattens all). */
export function generateFakePocket(n = 200): PocketColumn[] {
  _seed = 0x2f6e2b1; // reset for determinism
  const mustSee: PlaceItem[] = [];
  const foodDrink: PlaceItem[] = [];

  for (let i = 0; i < n; i++) {
    const cat = CATS[i % CATS.length]; // even spread across the 5 intents
    const sub = pick(cat.subs);
    const region = pick(REGIONS);
    const r = rand();
    const item: PlaceItem = {
      id: `fake-${i}`,
      title: `${sub} ${i + 1}`,
      category: cat.legacy,
      subCategory: sub,
      area: pick(AREAS),
      // jitter ~±0.4° around a region → city-sized spread for the zoom tiers
      lat: region.lat + (rand() - 0.5) * 0.8,
      lng: region.lng + (rand() - 0.5) * 0.8,
      budget: pick(BUDGETS),
      rating: Math.round((3 + rand() * 2) * 10) / 10, // 3.0–5.0
      userRatingCount: Math.floor(rand() * 2000),
      openingHours: '9 AM - 6 PM',
      formattedAddress: `${pick(AREAS)} district`,
      googlePlaceFieldsLoaded: true, // inline data present → no Places API fetch on select
      tags: [pick(TAGS), pick(TAGS)],
      // STATUS (not category): ~15% booked, ~15% backup — tags riding on real fields
      ...(r < 0.15 ? { reservationBound: true } : r < 0.30 ? { tripRole: 'optional' as const } : {}),
    };
    (item.category === 'food' ? foodDrink : mustSee).push(item);
  }

  return [
    { id: 'must-see', title: 'MUST SEE', items: mustSee },
    { id: 'food-drink', title: 'FOOD & DRINK', items: foodDrink },
  ];
}

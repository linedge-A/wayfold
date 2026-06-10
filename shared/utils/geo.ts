/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geo primitives — great-circle distance, shared by the constraint engine (route transit cost) and
 * trip-brief Tier-1 area routing. Promoted out of modules/constraint-engine so trip-brief no longer
 * reaches into another module's internals (agent.md dependency rule).
 */

/** Great-circle distance in km, or null when either point lacks coordinates. */
export const haversineKm = (a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }): number | null => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

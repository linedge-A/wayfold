/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Constraint-engine primitives — the ONE source of truth for clock / geo / opening-hours math
 * shared by the batch planner (planner.ts) and the incremental optimizer (optimizer.ts).
 * Pure, dependency-free, deterministic.
 */

/** Strict clock parse. Returns null for empty/unparseable input — callers use null to mean
 *  "no explicit time was set" (e.g. to decide whether an item is a locked, fixed-time anchor). */
export const parseClock = (timeStr?: string): number | null => {
  if (!timeStr) return null;
  const m = timeStr.trim().toUpperCase().match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour > 23 || minute > 59) return null;
  const ap = m[3];
  if (ap === 'PM' && hour < 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

/** Lenient clock parse with a default (used where a missing time should fall back, not signal). */
export const toMinutes = (timeStr?: string, fallback = 540): number => parseClock(timeStr) ?? fallback;

/** Minutes-since-midnight → "hh:mm AM/PM". Wraps past midnight and tolerates negatives. */
export const fromMinutes = (totalMin: number): string => {
  let r = Math.round(totalMin) % 1440;
  if (r < 0) r += 1440;
  let hour = Math.floor(r / 60);
  const minute = r % 60;
  const ap = hour >= 12 ? 'PM' : 'AM';
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ap}`;
};

/** Great-circle distance in km, or null when either point lacks coordinates. */
export const haversineKm = (a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }): number | null => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

/** Opening hours → a HARD [open, close] window in minutes, or null if absent/unparseable.
 *  Handles "24 Hrs" and past-midnight closes ("6 PM - 12 AM" → [1080, 1440]). */
export const parseHours = (s?: string): [number, number] | null => {
  if (!s) return null;
  if (/24\s*(hr|hour)/i.test(s)) return [0, 1440];
  const p = s.split(/[-–—]/);
  if (p.length < 2) return null;
  const open = parseClock(p[0]), close = parseClock(p[1]);
  if (open == null || close == null) return null;
  return [open, close <= open ? close + 1440 : close];
};

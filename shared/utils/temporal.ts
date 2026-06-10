/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Temporal primitives — the ONE source of truth for clock / opening-hours math, shared by the
 * constraint engine (planner + optimizer, via ./primitives), trip-brief, and the ingestion booking
 * parser. Pure, dependency-free, deterministic. Promoted out of modules/constraint-engine so
 * non-engine modules can reuse it WITHOUT importing another module's internals (agent.md dep rule).
 */

/** Zero-pad an integer to 2 digits ("9" → "09"). */
export const pad = (n: number): string => String(n).padStart(2, '0');

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
  return `${pad(hour)}:${pad(minute)} ${ap}`;
};

/** Minutes-since-midnight → "HH:MM" (24-hour). Wraps past midnight and tolerates negatives.
 *  Complements fromMinutes (12-hour); used where an ISO/24h time string is needed (e.g. booking ISO). */
export const fromMinutes24 = (totalMin: number): string => {
  let r = Math.round(totalMin) % 1440;
  if (r < 0) r += 1440;
  return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
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

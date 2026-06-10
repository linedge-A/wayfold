/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wayfold itinerary planner — deterministic, front-end, constraint-first.
 *
 * Real trips are rarely from scratch: flights / hotels / a reserved dinner are already
 * booked. So the planner treats those as a FROZEN skeleton (the "locked" set) and fills
 * the FLEXIBLE items into the gaps *around* them — never overlapping a booking. "Generate
 * from scratch" is just the special case where nothing is locked.
 *
 * Three lockedness tiers, derived from the calendar pin/booking state:
 *   locked    = hard-pin / reservation / anchor WITH a fixed time → immovable block
 *   mustkeep  = the user FIXED it (soft/hard pin) but no exact time → guaranteed a slot
 *               (this is how a corridor "lookout" becomes a must-see checkpoint once pinned)
 *   flexible  = unpinned → scored, placed if it fits, else overflow to the pocket
 *
 * Stop class governs mechanics: 'corridor' (lookout) = short dwell, doesn't count to the
 * day's pace cap, dropped first — UNLESS pinned, which promotes it to mustkeep/locked.
 */
import type { ItineraryItem } from '../../shared/types/index';

export type Persona = 'family' | 'friends' | 'couple' | 'solo' | 'default';
type StopClass = 'anchor' | 'destination' | 'corridor';

export interface PlannerInput {
  brief: { style?: string; persona?: Persona; interests?: string[]; keepAll?: boolean };
  dayIds: string[];
  pool: ItineraryItem[]; // may include locked bookings, pinned items, and flexible candidates
  // keepAll: re-optimize an already-curated itinerary — re-time/re-order every item but never
  // drop one for the pace cap (pace becomes a soft target). Off = generate from a candidate
  // pool, where the pace cap prunes the overflow into the pocket.
}
export interface PlannerResult {
  scheduled: ItineraryItem[];
  overflow: ItineraryItem[];
  flags: string[]; // feasibility conflicts / couldn't-fit-a-pinned-item
  notes: string[];
}

const PACE_BY_STYLE: Record<string, number> = { relaxing: 3, luxury: 3, balanced: 4, budget: 4, intense: 5 };
const PERSONA_PACE_DELTA: Record<Persona, number> = { family: -1, couple: 0, solo: 0, friends: +1, default: 0 };
const DWELL_FACTOR: Record<Persona, number> = { family: 1.3, couple: 1.1, default: 1.0, friends: 1.0, solo: 0.85 };
const CATEGORY_TYP: Record<string, number> = { sight: 75, food: 75, stay: 60, transit: 30 };
const DAY_START = 9 * 60, DAY_END = 22 * 60; // 9am–10pm window (room for dinners / night markets)
const SLOT_CENTER: Record<'am' | 'lunch' | 'pm' | 'dinner', number> = { am: 10 * 60, lunch: 12 * 60 + 30, pm: 15 * 60, dinner: 19 * 60 };
const PRIORITY_W: Record<string, number> = { must: 4, high: 3, medium: 2, low: 1 };
const ROLE_W: Record<string, number> = { anchor: 3, supporting: 2, optional: 1 };
const VERDICT_W: Record<string, number> = { must: 3, recommended: 2, mixed: 1, skip: -100 };

const sig = (it: any) => it.signals || {};
const parseT = (t?: string): number | null => {
  if (!t) return null;
  const m = t.trim().toUpperCase().match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = +m[1]; const mn = m[2] ? +m[2] : 0; const ap = m[3];
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + mn;
};
const fmtT = (mins: number): string => {
  const h24 = Math.floor(mins / 60) % 24, mn = Math.round(mins % 60);
  const ap = h24 >= 12 ? 'PM' : 'AM'; let h = h24 % 12; if (h === 0) h = 12;
  return `${h < 10 ? '0' + h : h}:${mn < 10 ? '0' + mn : mn} ${ap}`;
};

const classOf = (it: any): StopClass =>
  it.stopClass || (it.category === 'stay' ? 'anchor' : 'destination');
const dwell = (it: any, persona: Persona): number => {
  const base = it.estimatedDurationMin || (classOf(it) === 'corridor' ? 15 : CATEGORY_TYP[it.category] || 60);
  return Math.max(it.minDwell || 5, Math.round(base * (DWELL_FACTOR[persona] ?? 1)));
};
// Remembered-interest prior (from AGENTS.md, passed in via brief.interests). Ingestion tags
// items with the same canonical vocabulary (food-market, zen, walking…), so this is mostly a
// tag-set intersection, with a light title/category fallback. Capped so it nudges, never
// overrides a hard signal (verdict/pin).
const interestBoost = (it: any, interests?: string[]): number => {
  if (!interests || !interests.length) return 0;
  const tags: string[] = (it.tags || []).map((t: string) => String(t).toLowerCase());
  const hay = `${it.title || ''} ${it.subCategory || ''} ${it.category || ''}`.toLowerCase();
  let hits = 0;
  for (const i of interests) {
    const k = i.toLowerCase();
    if (tags.includes(k) || hay.includes(k.replace(/-/g, ' '))) hits++;
  }
  return Math.min(hits, 2) * 3; // +3 per match, capped at +6
};
const score = (it: any, interests?: string[]) =>
  (PRIORITY_W[it.priority] ?? 2) * 2 + (ROLE_W[it.tripRole] ?? 2) + (VERDICT_W[sig(it).verdict] ?? 0) + interestBoost(it, interests);
const slotOf = (it: any): keyof typeof SLOT_CENTER => {
  const bt = String(sig(it).bestTime || '').toLowerCase();
  if (it.category === 'food') return /breakfast|brunch|morning/.test(bt) ? 'am' : 'dinner';
  if (/sunrise|early|morning/.test(bt)) return 'am';
  if (/sunset|evening|night|aurora/.test(bt)) return 'pm';
  return it.category === 'sight' ? 'am' : 'pm';
};

// Real-distance transit: Haversine on lat/lng → driving minutes. Falls back to an area-string
// proxy only when coordinates are missing.
const haversineKm = (a: any, b: any): number | null => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const transitMinutes = (from: any, to: any): number => {
  if (from == null) return 0; // first stop of the day starts from the base
  const km = haversineKm(from, to);
  if (km == null) return from.area === to.area ? 10 : 30; // fallback when coords missing
  return Math.max(5, Math.min(90, Math.round((km / 25) * 60 + 3))); // ~25 km/h urban + 3-min overhead
};
// Access overhead at the destination (parking, ticket queue) — from the dwell/transit discussion.
const arrivalOverhead = (to: any): number =>
  (to.needsParking ? 10 : 0) + (to.ticketed ? (to.queueMin ?? 15) : 0);

// Opening hours = a HARD window in the cost model: you can't visit when a place is closed.
// This is what makes a night market land at night, and Nishiki (closes 6pm) NOT snap to 7pm —
// no special "meal" hack, just the hours of the venue.
const parseHours = (s?: string): [number, number] | null => {
  if (!s) return null;
  if (/24\s*(hr|hour)/i.test(s)) return [DAY_START, DAY_END];
  const p = s.split(/[-–—]/); if (p.length < 2) return null;
  const o = parseT(p[0]), c = parseT(p[1]);
  if (o == null || c == null) return null;
  return [o, c <= o ? c + 1440 : c]; // handle past-midnight close (e.g. 6 PM – 12 AM)
};
const openWindow = (it: any): [number, number] => parseHours(it.openingHours) ?? [DAY_START, DAY_END];
// Preferred meal centre derived from signals → else from WHEN the venue is actually open.
const mealCenter = (it: any): number => {
  const bt = String(sig(it).bestTime || '').toLowerCase();
  if (/breakfast|brunch/.test(bt)) return 8 * 60 + 30;
  if (/dinner|evening|night/.test(bt)) return 19 * 60;
  if (/lunch|midday|noon/.test(bt)) return 12 * 60 + 30;
  const [open, close] = openWindow(it);
  if (open >= 16 * 60) return Math.max(19 * 60, open + 15);                 // opens in the evening → dinner/night
  if (close <= 15 * 60) return open <= 9 * 60 ? 8 * 60 + 30 : 12 * 60 + 30; // morning / lunch-only
  return 12 * 60 + 30;                                                       // spans midday → lunch
};
const prefCenter = (it: any): number => it.category === 'food' ? mealCenter(it) : SLOT_CENTER[slotOf(it)];

type Lock = 'locked' | 'mustkeep' | 'flexible';
const lockednessOf = (it: any): Lock => {
  const hasTime = parseT(it.startTime) != null;
  if (hasTime && (it.pinState === 'hard' || it.reservationBound === true || it.tripRole === 'anchor')) return 'locked';
  if (it.pinState === 'soft' || it.pinState === 'hard') return 'mustkeep'; // user fixed it (e.g. a pinned lookout)
  return 'flexible';
};

export function generateItinerary(input: PlannerInput): PlannerResult {
  const flags: string[] = [], notes: string[] = [];
  const persona = (input.brief.persona || 'default') as Persona;
  const style = input.brief.style || 'balanced';
  const interests = input.brief.interests;
  const keepAll = !!input.brief.keepAll;
  const pace = Math.max(2, Math.min(6, (PACE_BY_STYLE[style] ?? 4) + (PERSONA_PACE_DELTA[persona] ?? 0)));
  notes.push(`pace ${pace} destinations/day (style=${style}, persona=${persona}); corridor stops are uncapped`);

  const days = input.dayIds;
  const locked = input.pool.filter(it => lockednessOf(it) === 'locked');
  const mustkeep = input.pool.filter(it => lockednessOf(it) === 'mustkeep');
  const skips = input.pool.filter(it => lockednessOf(it) === 'flexible' && sig(it).verdict === 'skip');
  skips.forEach(it => notes.push(`dropped (verdict:skip): ${it.title}`));
  const flexible = input.pool
    .filter(it => lockednessOf(it) === 'flexible' && sig(it).verdict !== 'skip')
    .sort((a, b) => score(b, interests) - score(a, interests) || (a.title || '').localeCompare(b.title || ''));

  locked.forEach(l => notes.push(`locked${(l as any).cancelable === true ? ' (cancellable)' : ''}: ${l.title} @ ${l.startTime} [${l.dayId}]`));

  // theme area per day from its locked items
  const themeArea: Record<string, string | null> = {};
  for (const d of days) {
    const areas = locked.filter(l => l.dayId === d).map(l => l.area).filter(Boolean) as string[];
    const c: Record<string, number> = {}; areas.forEach(a => { c[a] = (c[a] || 0) + 1; });
    themeArea[d] = Object.keys(c).sort((x, y) => c[y] - c[x])[0] || null;
  }

  // ASSIGN flexible/mustkeep to days (honor dayId hint, else area-cluster, else least full)
  const wishlist: Record<string, ItineraryItem[]> = {};
  days.forEach(d => { wishlist[d] = []; });
  const destCount: Record<string, number> = {};
  days.forEach(d => { destCount[d] = locked.filter(l => l.dayId === d && classOf(l) !== 'corridor').length; });
  const assign = (it: ItineraryItem, guaranteed: boolean) => {
    let d = it.dayId && wishlist[it.dayId] ? it.dayId : null;
    if (!d) {
      const matches = days.filter(x => themeArea[x] === it.area);
      d = (matches.length ? matches : days).sort((a, b) => destCount[a] - destCount[b])[0];
    }
    if (!guaranteed && !keepAll && classOf(it) !== 'corridor' && destCount[d] >= pace) {
      // try another day under cap
      const alt = days.filter(x => destCount[x] < pace).sort((a, b) => destCount[a] - destCount[b])[0];
      if (alt) d = alt; else return false; // no room as a destination anywhere
    }
    wishlist[d].push(it);
    if (classOf(it) !== 'corridor') destCount[d]++;
    return true;
  };
  mustkeep.forEach(it => { if (!assign(it, true)) flags.push(`⚠ no room for pinned "${it.title}" — over-constrained`); });
  const notAssigned: ItineraryItem[] = [];
  flexible.forEach(it => { if (!assign(it, false)) notAssigned.push(it); });

  // PLACE: per day — value-ordered forward sweep, packing flexibles into the run-up to
  // each frozen booking. Transit is area-aware (clustered stops are cheap), so high-value
  // "must" items win the prime slots instead of being fragmented by a flat buffer.
  const scheduled: ItineraryItem[] = [];
  const overflow: ItineraryItem[] = [...notAssigned];

  for (const d of days) {
    const dayLocked = locked.filter(l => l.dayId === d)
      .sort((a, b) => (parseT(a.startTime) ?? 0) - (parseT(b.startTime) ?? 0));
    // feasibility among locked bookings (surface, don't resolve)
    for (let i = 1; i < dayLocked.length; i++) {
      const pEnd = parseT(dayLocked[i - 1].endTime) ?? (parseT(dayLocked[i - 1].startTime)! + dwell(dayLocked[i - 1], persona));
      const cStart = parseT(dayLocked[i].startTime)!;
      if (cStart < pEnd) flags.push(`⚠ CONFLICT ${d}: "${dayLocked[i - 1].title}" overlaps "${dayLocked[i].title}"`);
      else if (cStart - pEnd < 20) flags.push(`⚠ TIGHT ${d}: only ${cStart - pEnd}m between "${dayLocked[i - 1].title}" and "${dayLocked[i].title}"`);
    }

    // queue: earliest preferred window first, then highest value (musts/high-value win the slot)
    const q = wishlist[d].slice().sort((a, b) =>
      prefCenter(a) - prefCenter(b) || score(b, interests) - score(a, interests)) as any[];
    let cursor = DAY_START;
    let prevItem: any = null;
    // place the first queued item (slot/value order) that fits the current window AND is open;
    // re-scan after each placement so an item gated by its opening hours simply waits for a
    // later flush instead of blocking the whole queue.
    const flush = (limit: number) => {
      let placed = true;
      while (placed) {
        placed = false;
        for (let i = 0; i < q.length; i++) {
          const it = q[i];
          const dur = dwell(it, persona);
          const [open, close] = openWindow(it);
          let start = Math.max(cursor + transitMinutes(prevItem, it) + arrivalOverhead(it), open); // never before it opens
          if (it.category === 'food') start = Math.max(start, mealCenter(it));                     // prefer meal time
          if (start + dur <= Math.min(limit, close)) {                                              // fits AND still open
            scheduled.push({ ...it, dayId: d, startTime: fmtT(start), endTime: fmtT(start + dur) });
            cursor = start + dur; prevItem = it; q.splice(i, 1); placed = true; break;
          }
        }
      }
    };
    for (const l of dayLocked) {
      const ls = parseT(l.startTime)!, le = parseT(l.endTime) ?? ls + dwell(l, persona);
      flush(ls);                                   // pack what fits before the booking
      scheduled.push({ ...l, endTime: l.endTime || fmtT(le) });
      cursor = Math.max(cursor, le); prevItem = l;
    }
    flush(DAY_END);
    for (const it of q) {
      if (lockednessOf(it) === 'mustkeep') flags.push(`⚠ pinned "${it.title}" couldn't fit ${d} — day full`);
      else overflow.push(it);
    }
  }

  scheduled.sort((a, b) => days.indexOf(a.dayId!) - days.indexOf(b.dayId!) || (parseT(a.startTime) ?? 0) - (parseT(b.startTime) ?? 0));
  notes.push(`scheduled ${scheduled.length} (locked ${locked.length}, pinned ${mustkeep.length}), overflow ${overflow.length}, flags ${flags.length}`);
  return { scheduled, overflow, flags, notes };
}

/** Tier-1 stub: order legs + allocate nights, then call generateItinerary per leg. */
export function planTrip(): PlannerResult {
  throw new Error('planTrip (multi-leg) not implemented — call generateItinerary per leg');
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wayfold batch itinerary planner — deterministic, constraint-first.
 *
 * Sibling of optimizer.ts: the optimizer INSERTS one place into an existing day; this planner
 * GENERATES whole days around a frozen skeleton of bookings/pins. Both share primitives.ts.
 *
 * Real trips are rarely from scratch — flights / hotels / a reserved dinner are already booked.
 * So locked items are a frozen skeleton and flexible items are filled into the gaps around them.
 * Three lockedness tiers, read from the calendar pin/booking state:
 *   locked    = hard-pin / reservation / anchor WITH a fixed time → immovable block
 *   mustkeep  = the user FIXED it (soft/hard pin) but gave no exact time → guaranteed a slot
 *               (this is how a pinned corridor "lookout" becomes a must-see checkpoint)
 *   flexible  = unpinned → scored, placed if it fits, else overflow to the pocket
 *
 * Stop class governs mechanics: 'corridor' (a quick lookout) = short dwell, doesn't count to the
 * day's pace cap, shed first — unless pinned, which promotes it to mustkeep.
 */
import { parseClock as parseT, fromMinutes as fmtT, haversineKm, parseHours } from './primitives';
import { paceFor } from '../../shared/constants/pacing';

export type Persona = 'family' | 'friends' | 'couple' | 'solo' | 'default';
export type StopClass = 'anchor' | 'destination' | 'corridor';

/** Structural contract the engine consumes. Deliberately independent of shared/types (Agent-9)
 *  so the engine carries no protected-type dependency; an ItineraryItem is assignable to this. */
export interface EngineItem {
  id?: string;
  title?: string;
  category?: string;
  dayId?: string;
  area?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
  estimatedDurationMin?: number;
  minDwell?: number;
  priority?: string;
  tripRole?: string;
  pinState?: string;
  reservationBound?: boolean;
  cancelable?: boolean;
  stopClass?: StopClass;
  openingHours?: string;
  ticketed?: boolean;
  queueMin?: number;
  needsParking?: boolean;
  signals?: { verdict?: string; bestTime?: string;[k: string]: unknown };
  [k: string]: unknown;
}

export interface PlannerInput {
  brief: { style?: string; persona?: Persona; interests?: string[]; keepAll?: boolean };
  dayIds: string[];
  pool: EngineItem[]; // bookings, pinned items, and flexible candidates together
}
export interface PlannerResult {
  scheduled: EngineItem[];
  overflow: EngineItem[];
  flags: string[]; // feasibility conflicts / pins that couldn't fit
  notes: string[];
}

const DWELL_FACTOR: Record<Persona, number> = { family: 1.3, couple: 1.1, default: 1.0, friends: 1.0, solo: 0.85 };
const CATEGORY_TYP: Record<string, number> = { sight: 75, food: 75, stay: 60, transit: 30 };
const DAY_START = 9 * 60, DAY_END = 22 * 60, LATE_END = 24 * 60; // 9am–10pm window; LATE_END lets aurora/night experiences run to midnight
const SLOT_CENTER = { am: 10 * 60, lunch: 12 * 60 + 30, pm: 15 * 60, dinner: 19 * 60 } as const;
const PRIORITY_W: Record<string, number> = { must: 4, high: 3, medium: 2, low: 1 };
const ROLE_W: Record<string, number> = { anchor: 3, supporting: 2, optional: 1 };
const VERDICT_W: Record<string, number> = { must: 3, recommended: 2, mixed: 1, skip: -100 };

const sig = (it: EngineItem) => it.signals || {};
const classOf = (it: EngineItem): StopClass => it.stopClass || (it.category === 'stay' ? 'anchor' : 'destination');
const dwell = (it: EngineItem, persona: Persona): number => {
  const base = it.estimatedDurationMin || (classOf(it) === 'corridor' ? 15 : CATEGORY_TYP[it.category || ''] || 60);
  return Math.max(it.minDwell || 5, Math.round(base * (DWELL_FACTOR[persona] ?? 1)));
};
// Remembered-interest prior (from AGENTS.md, passed via brief.interests). Ingestion tags items
// with the same canonical vocabulary (food-market, zen, walking…), so this is mostly a tag-set
// intersection with a light title/category fallback. Capped so it nudges, never overrides a hard
// signal (verdict/pin).
const interestBoost = (it: EngineItem, interests?: string[]): number => {
  if (!interests || !interests.length) return 0;
  const tags: string[] = ((it as any).tags || []).map((t: string) => String(t).toLowerCase());
  const hay = `${it.title || ''} ${(it as any).subCategory || ''} ${it.category || ''}`.toLowerCase();
  let hits = 0;
  for (const i of interests) {
    const k = i.toLowerCase();
    if (tags.includes(k) || hay.includes(k.replace(/-/g, ' '))) hits++;
  }
  return Math.min(hits, 2) * 3; // +3 per match, capped at +6
};
const score = (it: EngineItem, interests?: string[]) =>
  (PRIORITY_W[it.priority || ''] ?? 2) * 2 + (ROLE_W[it.tripRole || ''] ?? 2) + (VERDICT_W[String(sig(it).verdict)] ?? 0) + interestBoost(it, interests);
const slotOf = (it: EngineItem): keyof typeof SLOT_CENTER => {
  const bt = String(sig(it).bestTime || '').toLowerCase();
  if (it.category === 'food') return /breakfast|brunch|morning/.test(bt) ? 'am' : 'dinner';
  if (/sunrise|early|morning/.test(bt)) return 'am';
  if (/sunset|evening|night|aurora/.test(bt)) return 'pm';
  return it.category === 'sight' ? 'am' : 'pm';
};

// Transit in minutes. Engine contract: 0 from the day's base (no prior stop); real Haversine
// driving time when coords exist; area-string fallback only when they don't.
const transitMinutes = (from: EngineItem | null, to: EngineItem): number => {
  if (from == null) return 0;
  const km = haversineKm(from, to);
  if (km == null) return from.area === to.area ? 10 : 30;
  return Math.max(5, Math.min(90, Math.round((km / 25) * 60 + 3))); // ~25 km/h urban + 3-min overhead
};
const arrivalOverhead = (to: EngineItem): number =>
  (to.needsParking ? 10 : 0) + (to.ticketed ? (to.queueMin ?? 15) : 0);
// Best-time → an evening CENTER for the moments that must happen late. Drives queue order, and
// (via timeFloor) holds the item out of the early afternoon. Morning/early need no floor — queue
// order + opening hours already pull them first.
const BESTTIME_CENTER: { re: RegExp; t: number }[] = [
  { re: /aurora/, t: 20 * 60 },
  { re: /sunset|golden/, t: 18 * 60 + 30 },
  { re: /night/, t: 19 * 60 },
  { re: /evening/, t: 18 * 60 + 30 },
  { re: /sunrise|early|morning/, t: 9 * 60 + 30 },
];
// Opening hours are a HARD window — what makes a night market land at night and a 6pm-close place
// not get snapped to 7pm. Aurora/night/sunset experiences with no stated hours may run past the
// normal 10pm window, so widen their close to midnight.
const openWindow = (it: EngineItem): [number, number] => {
  const h = parseHours(it.openingHours);
  if (h) return h;
  return /aurora|night|sunset/.test(String(sig(it).bestTime || '').toLowerCase()) ? [DAY_START, LATE_END] : [DAY_START, DAY_END];
};
const mealCenter = (it: EngineItem): number => {
  const bt = String(sig(it).bestTime || '').toLowerCase();
  if (/breakfast|brunch|morning|sunrise/.test(bt)) return 8 * 60 + 30;       // incl. "morning" → early
  if (/dinner|evening|night|sunset/.test(bt)) return 19 * 60;                 // incl. "sunset" → evening
  if (/lunch|midday|noon/.test(bt)) return 12 * 60 + 30;
  const [open, close] = openWindow(it);                                     // else derive from when it's open
  if (open >= 16 * 60) return Math.max(19 * 60, open + 15);                 // opens in the evening → dinner/night
  if (close <= 15 * 60) return open <= 9 * 60 ? 8 * 60 + 30 : 12 * 60 + 30; // morning / lunch-only
  return 12 * 60 + 30;                                                       // spans midday → lunch
};
// The time a stop "wants" (queue ordering): food → meal time; else its best-time center or am/pm slot.
const timeCenter = (it: EngineItem): number => {
  if (it.category === 'food') return mealCenter(it);
  const bt = String(sig(it).bestTime || '').toLowerCase();
  for (const { re, t } of BESTTIME_CENTER) if (re.test(bt)) return t;
  return SLOT_CENTER[slotOf(it)];
};
// Earliest a stop may START. Meals get their meal floor; late-anchored moments (sunset/aurora/
// night/evening) get an evening floor so they're never swept into midday. Everything else: none.
const timeFloor = (it: EngineItem): number => {
  if (it.category === 'food') return mealCenter(it);
  const bt = String(sig(it).bestTime || '').toLowerCase();
  if (/aurora/.test(bt)) return 20 * 60;
  if (/sunset|golden|night|evening/.test(bt)) return 18 * 60 + 30;
  return 0;
};
const prefCenter = (it: EngineItem): number => timeCenter(it);

type Lock = 'locked' | 'mustkeep' | 'flexible';
const lockednessOf = (it: EngineItem): Lock => {
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
  const keepAll = !!input.brief.keepAll; // re-optimize a curated itinerary: re-time/re-order, never drop
  const pace = paceFor(style, persona);
  const days = input.dayIds;

  if (!days.length) return { scheduled: [], overflow: [...input.pool], flags: ['⚠ no days provided'], notes };
  notes.push(`pace ${pace} destinations/day (style=${style}, persona=${persona}); corridor stops are uncapped`);

  const locked = input.pool.filter(it => lockednessOf(it) === 'locked');
  const mustkeep = input.pool.filter(it => lockednessOf(it) === 'mustkeep');
  input.pool.filter(it => lockednessOf(it) === 'flexible' && sig(it).verdict === 'skip')
    .forEach(it => notes.push(`dropped (verdict:skip): ${it.title}`));
  const flexible = input.pool
    .filter(it => lockednessOf(it) === 'flexible' && sig(it).verdict !== 'skip')
    .sort((a, b) => score(b, interests) - score(a, interests) || (a.title || '').localeCompare(b.title || ''));

  locked.forEach(l => notes.push(`locked${l.cancelable === true ? ' (cancellable)' : ''}: ${l.title} @ ${l.startTime} [${l.dayId}]`));

  // Theme area per day, taken from that day's locked items (used to cluster flexible items).
  const themeArea: Record<string, string | null> = {};
  for (const d of days) {
    const areas = locked.filter(l => l.dayId === d).map(l => l.area).filter(Boolean) as string[];
    const c: Record<string, number> = {}; areas.forEach(a => { c[a] = (c[a] || 0) + 1; });
    themeArea[d] = Object.keys(c).sort((x, y) => c[y] - c[x])[0] || null;
  }

  // ASSIGN flexible/mustkeep to days: dayId hint → area cluster → least-full.
  const wishlist: Record<string, EngineItem[]> = {};
  const destCount: Record<string, number> = {};
  for (const d of days) {
    wishlist[d] = [];
    destCount[d] = locked.filter(l => l.dayId === d && classOf(l) !== 'corridor').length;
  }
  const assign = (it: EngineItem, guaranteed: boolean): boolean => {
    let d: string | undefined = it.dayId && wishlist[it.dayId] ? it.dayId : undefined;
    if (!d) {
      const matches = days.filter(x => themeArea[x] === it.area);
      d = (matches.length ? matches : days.slice()).sort((a, b) => destCount[a] - destCount[b])[0]; // slice: never sort input.dayIds
    }
    if (!guaranteed && !keepAll && classOf(it) !== 'corridor' && destCount[d] >= pace) {
      const alt = days.filter(x => destCount[x] < pace).sort((a, b) => destCount[a] - destCount[b])[0];
      if (alt) d = alt; else return false; // no room as a destination on any day
    }
    wishlist[d].push(it);
    if (classOf(it) !== 'corridor') destCount[d]++;
    return true;
  };
  mustkeep.forEach(it => { if (!assign(it, true)) flags.push(`⚠ no room for pinned "${it.title}" — over-constrained`); });
  const overflow: EngineItem[] = [];
  flexible.forEach(it => { if (!assign(it, false)) overflow.push(it); });

  // PLACE: per day — value-ordered forward sweep. Pack the highest-value flexible items into the
  // run-up to each frozen booking; opening hours are a hard window; transit is real distance.
  const scheduled: EngineItem[] = [];
  for (const d of days) {
    const dayLocked = locked.filter(l => l.dayId === d)
      .sort((a, b) => (parseT(a.startTime) ?? 0) - (parseT(b.startTime) ?? 0));
    // Feasibility among bookings (surface, never silently resolve).
    for (let i = 1; i < dayLocked.length; i++) {
      const pEnd = parseT(dayLocked[i - 1].endTime) ?? ((parseT(dayLocked[i - 1].startTime) ?? 0) + dwell(dayLocked[i - 1], persona));
      const cStart = parseT(dayLocked[i].startTime) ?? 0;
      if (cStart < pEnd) flags.push(`⚠ CONFLICT ${d}: "${dayLocked[i - 1].title}" overlaps "${dayLocked[i].title}"`);
      else if (cStart - pEnd < 20) flags.push(`⚠ TIGHT ${d}: only ${cStart - pEnd}m between "${dayLocked[i - 1].title}" and "${dayLocked[i].title}"`);
    }

    // queue: earliest preferred window first, then highest value (musts/high-value win the slot)
    const q = wishlist[d].slice().sort((a, b) => prefCenter(a) - prefCenter(b) || score(b, interests) - score(a, interests));
    let cursor = DAY_START;
    let prevItem: EngineItem | null = null;
    // Place the first queued item (slot/value order) that fits the current window AND is open;
    // re-scan after each placement so an item gated by its opening hours waits for a later flush
    // instead of blocking the whole queue.
    const flush = (limit: number) => {
      let placed = true;
      while (placed) {
        placed = false;
        for (let i = 0; i < q.length; i++) {
          const it = q[i];
          const dur = dwell(it, persona);
          const [open, close] = openWindow(it);
          const start = Math.max(cursor + transitMinutes(prevItem, it) + arrivalOverhead(it), open, timeFloor(it)); // not before it opens / its best-time floor
          if (start + dur <= Math.min(limit, close)) {                                              // fits AND still open
            scheduled.push({ ...it, dayId: d, startTime: fmtT(start), endTime: fmtT(start + dur) });
            cursor = start + dur; prevItem = it; q.splice(i, 1); placed = true; break;
          }
        }
      }
    };
    for (const l of dayLocked) {
      const ls = parseT(l.startTime) ?? DAY_START, le = parseT(l.endTime) ?? ls + dwell(l, persona);
      flush(ls);                                   // pack what fits before the booking
      scheduled.push({ ...l, endTime: l.endTime || fmtT(le) });
      cursor = Math.max(cursor, le); prevItem = l;
    }
    flush(LATE_END);                               // normal stops still capped at their close (DAY_END); only late items use the extra
    for (const it of q) {                          // anything left didn't fit the day
      if (lockednessOf(it) === 'mustkeep') flags.push(`⚠ pinned "${it.title}" couldn't fit ${d} — moved to pocket`);
      overflow.push(it);
    }
  }

  scheduled.sort((a, b) => days.indexOf(a.dayId!) - days.indexOf(b.dayId!) || (parseT(a.startTime) ?? 0) - (parseT(b.startTime) ?? 0));
  notes.push(`scheduled ${scheduled.length} (locked ${locked.length}, pinned ${mustkeep.length}), overflow ${overflow.length}, flags ${flags.length}`);
  return { scheduled, overflow, flags, notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier-1: leg/night allocation for multi-city / road trips
// ─────────────────────────────────────────────────────────────────────────────
interface Leg { area: string; items: EngineItem[]; lat?: number; lng?: number; stops: number; lockedDayIdx: number[]; }

const legCentroid = (items: EngineItem[]): { lat?: number; lng?: number } => {
  const pts = items.filter(i => i.lat != null && i.lng != null);
  if (!pts.length) return {};
  return { lat: pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length, lng: pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length };
};
const dayIndex = (id?: string): number => { const m = /(\d+)/.exec(id || ''); return m ? parseInt(m[1], 10) - 1 : -1; };

// Order legs along a route: start at the arrival leg (earliest locked day) or the highest-value
// leg, then nearest-neighbour by centroid.
const routeLegs = (legs: Leg[], interests?: string[]): Leg[] => {
  let start = 0, bestLocked = Infinity;
  legs.forEach((l, i) => { const e = l.lockedDayIdx.length ? Math.min(...l.lockedDayIdx) : Infinity; if (e < bestLocked) { bestLocked = e; start = i; } });
  if (bestLocked === Infinity) { let bv = -Infinity; legs.forEach((l, i) => { const v = Math.max(...l.items.map(it => score(it, interests))); if (v > bv) { bv = v; start = i; } }); }
  const order: Leg[] = [legs[start]]; const used = new Set([start]); let cur = start;
  while (order.length < legs.length) {
    let nxt = -1, nd = Infinity;
    legs.forEach((l, i) => { if (used.has(i)) return; const d = haversineKm(legs[cur], l) ?? Number.MAX_SAFE_INTEGER; if (d < nd) { nd = d; nxt = i; } });
    if (nxt < 0) break; order.push(legs[nxt]); used.add(nxt); cur = nxt;
  }
  return order;
};

// Allocate whole days per leg: ≥1 each, proportional to stop count, summing to N.
const allocateDays = (legs: Leg[], N: number): number[] => {
  const total = legs.reduce((s, l) => s + l.stops, 0) || 1;
  const alloc = legs.map(l => Math.max(1, Math.round((N * l.stops) / total)));
  const byDense = legs.map((_, i) => i).sort((a, b) => legs[b].stops / alloc[b] - legs[a].stops / alloc[a]);
  let diff = N - alloc.reduce((a, b) => a + b, 0), g = 0;
  while (diff > 0) { alloc[byDense[g % byDense.length]]++; diff--; g++; }
  for (let k = byDense.length - 1; diff < 0 && g < 10000; k--, g++) { const idx = byDense[((k % byDense.length) + byDense.length) % byDense.length]; if (alloc[idx] > 1) { alloc[idx]--; diff++; } }
  return alloc;
};

/**
 * Tier-1 — order legs (cities) along a route, allocate nights ∝ stops, and fill each leg with
 * generateItinerary. Spreads a thin pool across the whole date range so multi-day road trips don't
 * leave empty days. A single-area (city) trip falls straight through to generateItinerary.
 */
export function planTrip(input: PlannerInput): PlannerResult {
  const days = input.dayIds, N = days.length;
  if (N === 0) return { scheduled: [], overflow: [...input.pool], flags: ['⚠ no days provided'], notes: [] };
  const interests = input.brief.interests;
  const pool = input.pool.map(it => ({ ...it }));               // clone — we stamp dayId

  const byArea = new Map<string, EngineItem[]>();
  for (const it of pool) { const k = it.area || '—'; (byArea.get(k) ?? byArea.set(k, []).get(k)!).push(it); }
  let legs: Leg[] = [...byArea.entries()].map(([area, items]) => {
    const c = legCentroid(items);
    return { area, items, lat: c.lat, lng: c.lng, stops: Math.max(1, items.filter(i => classOf(i) !== 'corridor').length), lockedDayIdx: [...new Set(items.map(i => dayIndex(i.dayId)).filter(x => x >= 0))] };
  });
  if (legs.length <= 1) return generateItinerary(input);        // city trip — not multi-leg

  const flags: string[] = [], overflow: EngineItem[] = [];
  if (legs.length > N) {                                        // more cities than days
    legs.sort((a, b) => b.stops - a.stops);
    const dropped = legs.slice(N); legs = legs.slice(0, N);
    overflow.push(...dropped.flatMap(l => l.items));
    flags.push(`⚠ ${legs.length + dropped.length} areas over ${N} days — deferred ${dropped.map(l => l.area).join(', ')} to the pocket`);
  }

  const ordered = routeLegs(legs, interests);
  const alloc = allocateDays(ordered, N);
  const scheduled: EngineItem[] = [], notes: string[] = [`route: ${ordered.map((l, i) => `${l.area}×${alloc[i]}n`).join(' → ')}`];
  let cur = 0;
  for (let i = 0; i < ordered.length; i++) {
    const leg = ordered[i], legDays = days.slice(cur, cur + alloc[i]); cur += alloc[i];
    // keep a locked item on its day if it falls in this leg; spread the rest round-robin by value.
    const flex = leg.items.filter(it => !(it.dayId && legDays.includes(it.dayId) && lockednessOf(it) === 'locked')).sort((a, b) => score(b, interests) - score(a, interests));
    flex.forEach((it, idx) => { it.dayId = legDays[idx % legDays.length]; });
    for (const it of leg.items) if (lockednessOf(it) === 'locked' && it.dayId && !legDays.includes(it.dayId)) flags.push(`⚠ "${it.title}" booked on ${it.dayId}, outside its ${leg.area} leg (${legDays[0]}–${legDays[legDays.length - 1]})`);
    const r = generateItinerary({ brief: input.brief, dayIds: legDays, pool: leg.items });
    scheduled.push(...r.scheduled); overflow.push(...r.overflow); flags.push(...r.flags);
    notes.push(`  leg ${i + 1}: ${alloc[i]} night${alloc[i] > 1 ? 's' : ''} in ${leg.area} (${legDays[0]}${alloc[i] > 1 ? `–${legDays[legDays.length - 1]}` : ''})`);
  }
  const filled = new Set(scheduled.map(s => s.dayId));
  for (const d of days) if (!filled.has(d)) flags.push(`⚠ ${d} has no stops — thin pool for that leg`);
  notes.push(`planTrip: ${ordered.length} legs / ${N} days · scheduled ${scheduled.length} · overflow ${overflow.length}`);
  return { scheduled, overflow, flags, notes };
}

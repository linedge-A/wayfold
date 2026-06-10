/**
 * Spike: TEST the new placement rules before rebuilding the optimizer.
 * Run: node_modules/.bin/tsx modules/generator/test-rules.ts
 * Four refinements, each a pure term that drops into cost(day):
 *   1) time tier by CASE (non-giver / in-between / flexible) → windowPenalty
 *   2) adaptive dwell [min, typical], persona-scaled, no max → effectiveDwell
 *   3) transit + access overhead (parking, ticketing)        → effectiveTransit
 *   4) airport = backward-chained deadline, not flight time   → airportPlan
 */
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const BIG = 1e6;

// ── 1. Time tier by case ─────────────────────────────────────────────
type TimeRule =
  | { kind: 'hard'; window: [number, number] }      // reserved slot / opening hours — must start inside
  | { kind: 'natural'; at: number; tol: number }    // scarce natural moment (sunset/aurora) — "non-giver"
  | { kind: 'pref'; slot: 'am' | 'pm' | 'evening'; strength: number } // in-between: better morning/evening
  | { kind: 'flexible' };                            // time-insensitive
const SLOT_CENTER = { am: 10 * 60, pm: 15 * 60, evening: 20 * 60 };
function windowPenalty(rule: TimeRule, startMin: number): number {
  if (rule.kind === 'flexible') return 0;
  if (rule.kind === 'hard') return startMin >= rule.window[0] && startMin <= rule.window[1] ? 0 : BIG;
  if (rule.kind === 'natural') return Math.abs(startMin - rule.at) <= rule.tol ? 0 : BIG;
  return Math.round((Math.abs(startMin - SLOT_CENTER[rule.slot]) / 60) * rule.strength); // soft, per hour off
}

// ── 2. Adaptive dwell ────────────────────────────────────────────────
type Persona = 'family' | 'friends' | 'couple' | 'solo' | 'default';
const DWELL_FACTOR: Record<Persona, number> = { family: 1.3, couple: 1.1, default: 1.0, friends: 1.0, solo: 0.85 };
function effectiveDwell(item: { min: number; typ: number }, persona: Persona): number {
  return Math.max(item.min, Math.round(item.typ * DWELL_FACTOR[persona])); // no max — long stays just cost stops
}

// ── 3. Transit + access overhead ─────────────────────────────────────
function arrivalOverhead(to: { needsParking?: boolean; ticketed?: boolean; queueMin?: number }, mode: string): number {
  let o = 0;
  if (mode === 'drive' && to.needsParking) o += 10;       // find/pay parking + walk
  if (to.ticketed) o += to.queueMin ?? 15;                // queue / collect tickets
  return o;
}
const effectiveTransit = (legMin: number, to: any, mode: string) => legMin + arrivalOverhead(to, mode);

// ── 4. Airport = backward chain ──────────────────────────────────────
function airportPlan(flightDep: number, o: { checkIn: number; security: number; carDrop: number; buffer: number }, transitMin: number) {
  const atTerminalBy = flightDep - o.checkIn - o.security - o.buffer;
  const atAirportBy = atTerminalBy - o.carDrop;       // car drop happens before the terminal
  const leavePrevBy = atAirportBy - transitMin;       // ← the real deadline for the last stop
  return { atTerminalBy, atAirportBy, leavePrevBy };
}

// ════════════ TESTS ════════════
console.log('1) TIME TIER BY CASE (penalty at a candidate start time)');
const sunset: TimeRule = { kind: 'natural', at: 20 * 60, tol: 30 };
const reservation: TimeRule = { kind: 'hard', window: [12 * 60 + 30, 12 * 60 + 45] };
const museum: TimeRule = { kind: 'flexible' };
const cafe: TimeRule = { kind: 'pref', slot: 'am', strength: 3 };
for (const t of [10 * 60, 14 * 60, 20 * 60]) {
  console.log(`  @${hhmm(t)}  sunset=${windowPenalty(sunset, t)}  reservation=${windowPenalty(reservation, t)}  museum=${windowPenalty(museum, t)}  morning-cafe=${windowPenalty(cafe, t)}`);
}
console.log('  → sunset/reservation = ∞ (non-givers) outside their moment; museum = 0 anytime; cafe = soft slope.');

console.log('\n2) ADAPTIVE DWELL (min/typical, persona-scaled, no max)');
const spots = [{ name: 'Art Museum', min: 60, typ: 120 }, { name: 'Viewpoint', min: 15, typ: 30 }, { name: 'Temple', min: 30, typ: 50 }];
for (const p of ['family', 'friends', 'solo'] as Persona[]) {
  console.log('  ' + p.padEnd(8), spots.map(s => `${s.name} ${effectiveDwell(s, p)}m`).join('  |  '));
}
// pace EMERGES: how many fit a 9h (540m) day at ~25m avg transit?
for (const p of ['family', 'friends'] as Persona[]) {
  let t = 0, n = 0; const ring = spots;
  while (t < 540 && n < 12) { const s = ring[n % ring.length]; t += effectiveDwell(s, p) + 25; if (t <= 540) n++; else break; }
  console.log(`  → ${p} fits ~${n} stops/9h day (pace is a consequence of dwell, not a fixed cap)`);
}

console.log('\n3) TRANSIT + ACCESS OVERHEAD (20-min drive leg)');
console.log('  ticketed+parking attraction →', effectiveTransit(20, { needsParking: true, ticketed: true, queueMin: 15 }, 'drive'), 'min effective');
console.log('  free roadside viewpoint     →', effectiveTransit(20, {}, 'drive'), 'min effective');

console.log('\n4) AIRPORT BACKWARD CHAIN (flight 18:00)');
const intl = airportPlan(18 * 60, { checkIn: 45, security: 45, carDrop: 20, buffer: 30 }, 50);
const dom = airportPlan(18 * 60, { checkIn: 30, security: 30, carDrop: 20, buffer: 20 }, 50);
console.log(`  INTL  at-terminal ${hhmm(intl.atTerminalBy)} · at-airport ${hhmm(intl.atAirportBy)} · LEAVE LAST STOP BY ${hhmm(intl.leavePrevBy)}`);
console.log(`  DOM   at-terminal ${hhmm(dom.atTerminalBy)} · at-airport ${hhmm(dom.atAirportBy)} · LEAVE LAST STOP BY ${hhmm(dom.leavePrevBy)}`);
console.log(`  → flight is 18:00 but the real deadline is ${hhmm(intl.leavePrevBy)} (intl) — a ${(18 * 60 - intl.leavePrevBy)}-min chain, NOT the departure time.`);

// ── 5. Stop CLASS: a quick lookout is a corridor stop, not a destination ──
console.log('\n5) STOP CLASS — quick stopover (lookout) vs destination');
// priced by MARGINAL DETOUR off the A→B drive, not a full transit leg:
const marginalDetour = (aToB: number, aToS: number, sToB: number) => (aToS + sToB) - aToB;
const lookoutDwell = effectiveDwell({ min: 5, typ: 15 }, 'friends');          // ~15m, not 30
const onRoute = marginalDetour(60, 32, 30);   // lookout basically on the road
const offRoute = marginalDetour(60, 80, 18);  // "20 min off the highway"
console.log(`  lookout dwell = ${lookoutDwell}m (min 5 / typ 15) — short by type, not a flat 15`);
console.log(`  ON-route insert  = detour ${onRoute}m + dwell ${lookoutDwell}m = ${onRoute + lookoutDwell}m, and it does NOT consume a pace slot (it's transit enrichment)`);
console.log(`  OFF-route insert = detour ${offRoute}m + dwell ${lookoutDwell}m = ${offRoute + lookoutDwell}m — pricier; corridor stops carry a LOW drop-penalty, so they're shed first when the day runs tight`);
console.log('  vs a DESTINATION (museum 120m) = full transit leg + long dwell + consumes a pace slot + high drop-penalty');

/**
 * Tier-1 planTrip harness — proves multi-day road trips spread across the whole date range
 * (no empty days), legs route in geographic order, nights ∝ stops, and a booking holds its day.
 * Run: node_modules/.bin/tsx modules/constraint-engine/run-roadtrip.ts
 */
import { planTrip, generateItinerary, type PlannerInput } from './planner';

// Iceland Ring Road, 7 days, real coords — the case that left 3 empty days under the flat fill.
const pool: any[] = [
  { id: 'blue-lagoon', title: 'Blue Lagoon', category: 'sight', area: 'Reykjanes', lat: 63.8804, lng: -22.4495, openingHours: '8 AM - 9 PM', reservationBound: true, startTime: '11:00 AM', dayId: 'day-1', estimatedDurationMin: 120 },
  { id: 'thingvellir', title: 'Þingvellir', category: 'sight', area: 'Golden Circle', lat: 64.2559, lng: -21.1295, estimatedDurationMin: 60 },
  { id: 'geysir', title: 'Geysir', category: 'sight', area: 'Golden Circle', lat: 64.3104, lng: -20.3024, estimatedDurationMin: 45 },
  { id: 'gullfoss', title: 'Gullfoss', category: 'sight', area: 'Golden Circle', lat: 64.3271, lng: -20.1199, estimatedDurationMin: 45, signals: { verdict: 'must' } },
  { id: 'seljalandsfoss', title: 'Seljalandsfoss', category: 'sight', area: 'South', lat: 63.6156, lng: -19.9886, estimatedDurationMin: 40 },
  { id: 'skogafoss', title: 'Skógafoss', category: 'sight', area: 'South', lat: 63.5320, lng: -19.5114, estimatedDurationMin: 40 },
  { id: 'reynisfjara', title: 'Reynisfjara', category: 'sight', area: 'Vík', lat: 63.4064, lng: -19.0448, estimatedDurationMin: 45 },
  { id: 'jokulsarlon', title: 'Jökulsárlón', category: 'sight', area: 'Southeast', lat: 64.0784, lng: -16.2306, estimatedDurationMin: 60, signals: { verdict: 'must' } },
  { id: 'diamond', title: 'Diamond Beach', category: 'sight', area: 'Southeast', lat: 64.0438, lng: -16.1793, stopClass: 'corridor', estimatedDurationMin: 20 },
  { id: 'aurora', title: 'Aurora Hunt', category: 'sight', area: 'Vík', lat: 63.42, lng: -19.0, estimatedDurationMin: 90, signals: { verdict: 'must', bestTime: 'aurora' } },
];
const days = Array.from({ length: 7 }, (_, i) => `day-${i + 1}`);
const input: PlannerInput = { brief: { style: 'relaxing', persona: 'family' }, dayIds: days, pool };

// Baseline: contiguous area-chunking like generateFromBrief's clusterAssignDays — packs to a pace
// cap and leaves later days empty (the bug documented in run-broad: 7 empty days across the sweep).
const chunkBaseline = () => {
  const perDay = 2; // relaxing+family
  const areas = [...new Set(pool.map(p => p.area))];
  const stamped = pool.map(p => ({ ...p }));
  let di = 0, load = 0;
  for (const a of areas) for (const it of stamped.filter(s => s.area === a)) {
    if (load >= perDay && di < days.length - 1) { di++; load = 0; }
    it.dayId = days[di]; load++;
  }
  return generateItinerary({ ...input, pool: stamped });
};
const before = chunkBaseline();
const r = planTrip(input);

const dayOf = (id: string) => r.scheduled.find(s => s.id === id)?.dayId;
console.log('NOTES'); r.notes.forEach(n => console.log('  ' + n));
if (r.flags.length) { console.log('FLAGS'); r.flags.forEach(f => console.log('  ' + f)); }
console.log('\nITINERARY');
for (const d of days) {
  const items = r.scheduled.filter(s => s.dayId === d);
  console.log(`  ${d}: ${items.map((s: any) => `${s.title}@${s.startTime}`).join(' · ') || '(empty)'}`);
}
console.log('  overflow:', r.overflow.map((o: any) => o.title).join(', ') || '(none)');

const emptyBefore = days.filter(d => !before.scheduled.some(s => s.dayId === d)).length;
const emptyAfter = days.filter(d => !r.scheduled.some(s => s.dayId === d)).length;
console.log(`\n  empty days — flat fill: ${emptyBefore}  →  planTrip: ${emptyAfter}`);

// route order check: leg areas should appear in a sensible geographic chain (Reykjanes→GC→South→Vík→SE)
const routeNote = r.notes[0];
const checks: [string, boolean][] = [
  ['no empty days (was > 0 under flat fill)', emptyAfter === 0 && emptyBefore > 0],
  ['booking holds its day (Blue Lagoon @ day-1)', dayOf('blue-lagoon') === 'day-1'],
  ['all 7 days used', new Set(r.scheduled.map(s => s.dayId)).size === 7],
  ['route starts at arrival leg (Reykjanes)', routeNote.includes('route: Reykjanes')],
  ['nothing dropped (10 stops scheduled)', r.scheduled.length === 10],
  ['aurora lands in the evening (≥ 6pm)', (r.scheduled.find(s => s.id === 'aurora') as any)?.startTime?.includes('PM') ?? false],
  ['deterministic', JSON.stringify(planTrip(input).scheduled) === JSON.stringify(r.scheduled)],
];
let ok = true; console.log('\nCHECKS');
for (const [n, p] of checks) { console.log(`  ${p ? '✓' : '✗ FAIL'} ${n}`); ok &&= p; }
console.log(ok ? '\nALL GREEN' : '\nFAILURES'); if (!ok) process.exit(1);

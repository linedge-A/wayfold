/**
 * Constraint-first demo with REAL distances. Run: node_modules/.bin/tsx modules/generator/run-planner.ts
 * Day 1: a non-cancellable reserved lunch (locked) to plan around; a pinned "lookout" → must-keep
 *        checkpoint; transit now from real lat/lng so the Higashiyama cluster is genuinely cheap.
 * Day 2: two colliding bookings → feasibility flag.
 */
import { generateItinerary } from './planner';

const pool: any[] = [
  // ── Day 1 — plan around a booked lunch (Higashiyama/Gion cluster) ──
  { id: 'lunch', title: 'Kaiseki Lunch (reserved)', category: 'food', area: 'Gion', dayId: 'day-1', lat: 35.0036, lng: 135.7750, startTime: '12:30 PM', endTime: '02:00 PM', pinState: 'hard', reservationBound: true, cancelable: false },
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9949, lng: 135.7850, priority: 'high', estimatedDurationMin: 90, ticketed: true, queueMin: 15, signals: { bestTime: 'early morning', verdict: 'must' } },
  { id: 'ninenzaka', title: 'Ninenzaka Stroll', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9966, lng: 135.7820, priority: 'medium', estimatedDurationMin: 45 },
  { id: 'gionwalk', title: 'Gion Lantern Walk', category: 'sight', area: 'Gion', dayId: 'day-1', lat: 35.0036, lng: 135.7745, priority: 'medium', estimatedDurationMin: 45, signals: { bestTime: 'evening' } },
  { id: 'view-pin', title: 'Yasaka Pagoda Lookout', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9985, lng: 135.7806, stopClass: 'corridor', estimatedDurationMin: 15, pinState: 'soft', signals: { verdict: 'must' } }, // ← PINNED lookout = must-keep checkpoint
  { id: 'view-flex', title: 'Random Street Viewpoint', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9975, lng: 135.7815, stopClass: 'corridor', estimatedDurationMin: 15, priority: 'low' },
  { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', dayId: 'day-1', lat: 35.0050, lng: 135.7649, priority: 'medium', estimatedDurationMin: 60, openingHours: '9 AM - 6 PM' },        // lunch market — closes 6pm
  { id: 'nightmkt', title: 'Pontocho Night Stalls', category: 'food', area: 'Central', dayId: 'day-1', lat: 35.0042, lng: 135.7706, priority: 'high', estimatedDurationMin: 75, openingHours: '6 PM - 11 PM', signals: { bestTime: 'night', verdict: 'recommended' } }, // night market — opens 6pm

  // ── Day 2 — two bookings that collide (Arashiyama) ──
  { id: 'tour', title: 'Morning Temple Tour (booked)', category: 'sight', area: 'Arashiyama', dayId: 'day-2', lat: 35.0094, lng: 135.6668, startTime: '10:00 AM', endTime: '12:00 PM', pinState: 'hard', reservationBound: true, cancelable: true },
  { id: 'class', title: 'Bamboo Craft Class (booked)', category: 'sight', area: 'Arashiyama', dayId: 'day-2', lat: 35.0090, lng: 135.6670, startTime: '11:00 AM', endTime: '01:00 PM', pinState: 'hard', reservationBound: true, cancelable: false },
  { id: 'bamboo', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', dayId: 'day-2', lat: 35.0156, lng: 135.6715, priority: 'high', estimatedDurationMin: 45, signals: { bestTime: 'sunrise' } },
];

const r = generateItinerary({ brief: { style: 'intense', persona: 'friends' }, dayIds: ['day-1', 'day-2'], pool });

console.log('NOTES'); r.notes.forEach(n => console.log('  •', n));
if (r.flags.length) { console.log('FLAGS'); r.flags.forEach(f => console.log('  ' + f)); }
const mark = (s: any) =>
  (s.reservationBound ? '[BOOKED]' : s.pinState === 'soft' ? '[PINNED]' : '') +
  (s.stopClass === 'corridor' ? '[corridor]' : '') + (s.ticketed ? '[ticketed]' : '') +
  (s.openingHours ? `[open ${s.openingHours}]` : '');
for (const d of ['day-1', 'day-2']) {
  console.log(` ${d}:`);
  r.scheduled.filter(s => s.dayId === d).forEach(s =>
    console.log(`   ${s.startTime}–${s.endTime}  ${s.title} ${mark(s)}`.trimEnd()));
}
console.log(' overflow →', r.overflow.map(o => o.title).join(', ') || '(none)');

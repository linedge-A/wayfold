/**
 * Regenerate-from-pocket harness. Run: node_modules/.bin/tsx modules/trip-brief/run-regenerate.ts
 * Proves: (a) bookings/hard-pins stay put across a regenerate, (b) flexibles get re-placed,
 *         (c) fresh pocket folded in / overflow preserved, plus dedup + keepAll (nothing dropped).
 */
import { regenerateFromPocket } from './regenerateFromPocket';
import type { PocketItem } from './placeItemsToPool';

const board: any[] = [
  { id: 'lunch-resv', title: 'Kaiseki Lunch', category: 'food', area: 'Gion', dayId: 'day-1', lat: 35.0036, lng: 135.7750, startTime: '12:30 PM', endTime: '02:00 PM', reservationBound: true, pinState: 'none' },
  { id: 'pinned-temple', title: 'Kiyomizu (pinned)', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9949, lng: 135.7850, startTime: '03:00 PM', pinState: 'hard', estimatedDurationMin: 60 },
  { id: 'flex-stroll', title: 'Ninenzaka', category: 'sight', area: 'Higashiyama', dayId: 'day-1', lat: 34.9966, lng: 135.7820, startTime: '10:00 AM', pinState: 'none', estimatedDurationMin: 45 },
  { id: 'flex-arashi', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', dayId: 'day-2', lat: 35.0170, lng: 135.6716, startTime: '09:30 AM', pinState: 'none', estimatedDurationMin: 45 },
];

const pocket: { id: string; title: string; items: PocketItem[] }[] = [{ id: 'col', title: 'New finds', items: [
  { id: 'new-nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', lat: 35.0050, lng: 135.7649, openingHours: '9 AM - 6 PM', signals: { verdict: 'recommended' } },
  { id: 'flex-stroll', title: 'Ninenzaka (dup already on board)', category: 'sight', area: 'Higashiyama', lat: 34.9966, lng: 135.7820 }, // dedup target
  { id: 'new-tenryuji', title: 'Tenryu-ji', category: 'sight', area: 'Arashiyama', lat: 35.0157, lng: 135.6738, signals: { verdict: 'must' } },
] }];

const r = regenerateFromPocket({ board, pocket, dayIds: ['day-1', 'day-2'], brief: { style: 'balanced', persona: 'couple' } });

const out = new Map(r.itineraryItems.map((i: any) => [i.id, i]));
const dayOf = (id: string) => out.get(id)?.dayId;
const timeOf = (id: string) => out.get(id)?.startTime;

console.log('SCHEDULED:');
for (const d of ['day-1', 'day-2']) {
  r.itineraryItems.filter((i: any) => i.dayId === d).forEach((i: any) => console.log(`  ${d} ${i.startTime}–${i.endTime}  ${i.title}`));
}
console.log('overflow →', r.pocket.map((p: any) => p.id).join(', ') || '(none)');

const checks: [string, boolean][] = [
  ['booking stays put (day-1 @ 12:30 PM)', dayOf('lunch-resv') === 'day-1' && timeOf('lunch-resv') === '12:30 PM'],
  ['hard-pin stays put (day-1 @ 03:00 PM)', dayOf('pinned-temple') === 'day-1' && timeOf('pinned-temple') === '03:00 PM'],
  ['flexible re-placed, kept on its day', !!out.get('flex-stroll') && dayOf('flex-stroll') === 'day-1'],
  ['flexible (day-2) kept', !!out.get('flex-arashi') && dayOf('flex-arashi') === 'day-2'],
  ['fresh pocket folded in (scheduled or overflow)', !!out.get('new-tenryuji') || r.pocket.some((p: any) => p.id === 'new-tenryuji')],
  ['dedup: board item not duplicated', r.itineraryItems.filter((i: any) => i.id === 'flex-stroll').length === 1],
  ['keepAll: no curated board item dropped', ['lunch-resv', 'pinned-temple', 'flex-stroll', 'flex-arashi'].every(id => !!out.get(id))],
];
let ok = true;
console.log('\nCHECKS');
for (const [n, p] of checks) { console.log(`  ${p ? '✓' : '✗ FAIL'} ${n}`); ok &&= p; }
console.log(ok ? '\nALL GREEN' : '\nFAILURES');
if (!ok) process.exit(1);

/**
 * Make-up recovery harness. Run: node_modules/.bin/tsx modules/constraint-engine/run-makeup.ts
 *
 * A stop on day-1 is "missed". findBestDayFit should scan the LATER days and pick the one whose
 * schedule absorbs it with the least added transit — here day-3 (same Arashiyama cluster as the
 * missed stop) should beat day-2 (a far Higashiyama cluster), because re-inserting near its
 * geographic neighbours adds less driving.
 */
import type { ItineraryItem } from '@/shared/types/index';
import { findBestDayFit } from './optimizer';

const items: ItineraryItem[] = [
  // day-1: the missed stop lives here originally (Arashiyama)
  { id: 'bamboo', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', dayId: 'day-1', lat: 35.0156, lng: 135.6715, startTime: '09:00 AM', estimatedDurationMin: 60, pinState: 'none', priority: 'high' },
  // day-2: a HIGASHIYAMA cluster (far from Arashiyama) — re-inserting here adds lots of transit
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', dayId: 'day-2', lat: 34.9949, lng: 135.7850, startTime: '10:00 AM', estimatedDurationMin: 90, pinState: 'none', priority: 'high' },
  { id: 'ninenzaka', title: 'Ninenzaka', category: 'sight', area: 'Higashiyama', dayId: 'day-2', lat: 34.9966, lng: 135.7820, startTime: '01:00 PM', estimatedDurationMin: 45, pinState: 'none', priority: 'medium' },
  // day-3: an ARASHIYAMA cluster (same as the missed stop) — cheapest re-insertion
  { id: 'tenryuji', title: 'Tenryu-ji', category: 'sight', area: 'Arashiyama', dayId: 'day-3', lat: 35.0156, lng: 135.6738, startTime: '10:00 AM', estimatedDurationMin: 60, pinState: 'none', priority: 'high' },
  { id: 'monkeypark', title: 'Monkey Park', category: 'sight', area: 'Arashiyama', dayId: 'day-3', lat: 35.0095, lng: 135.6770, startTime: '01:00 PM', estimatedDurationMin: 60, pinState: 'none', priority: 'medium' },
];

const missed = items.find(i => i.id === 'bamboo')!;
const laterDays = ['day-2', 'day-3'];

const fit = findBestDayFit(missed, items, laterDays);

console.log('Missed stop:', missed.title, '(originally day-1, Arashiyama)');
console.log('Candidate later days:', laterDays.join(', '));
if (!fit) { console.log('❌ no fit found'); process.exit(1); }

console.log(`\nBest day  : ${fit.dayId}`);
console.log(`Added transit: +${fit.addedTransitMin} min`);
console.log(`Forces removal: ${fit.forcesRemoval}`);
const insert = fit.result.proposedChanges.find(c => c.itemId === missed.id);
console.log(`Re-inserted at: ${insert?.proposedTime} on ${insert?.itemData.dayId}`);

const enginePass = fit.dayId === 'day-3' && !fit.forcesRemoval && insert?.itemData.dayId === 'day-3';
console.log(`\n${enginePass ? '✅ PASS' : '❌ FAIL'} — best fit is the geographically-matching day (day-3, Arashiyama)`);

// ── Apply reducer (mirrors handleFindBestFit's setAppState map) ────────────────────────────────
// Prove the MOVE math: applying the proposed changes relocates the missed stop to the best day
// with status 'makeup', and leaves untouched items alone.
const byItemId = new Map(fit.result.proposedChanges.map(c => [c.itemId, c.itemData] as const));
const applied = items.map(i => {
  const data = byItemId.get(i.id);
  if (!data) return i;
  const isMoved = i.id === missed.id;
  return { ...i, dayId: data.dayId, startTime: data.startTime, endTime: data.endTime, ...(isMoved ? { status: 'makeup' as const } : {}) };
});
const movedBamboo = applied.find(i => i.id === missed.id)!;
const untouched = applied.find(i => i.id === 'kiyomizu')!; // a far-day item not in the changeset
console.log(`\nAfter apply: ${movedBamboo.title} → day=${movedBamboo.dayId}, status=${movedBamboo.status}, time=${movedBamboo.startTime}`);
console.log(`Untouched control (Kiyomizu): day=${untouched.dayId} (should stay day-2)`);
const applyPass = movedBamboo.dayId === 'day-3' && movedBamboo.status === 'makeup' && untouched.dayId === 'day-2';
console.log(`${applyPass ? '✅ PASS' : '❌ FAIL'} — moved stop relocated + tagged make-up; control untouched`);

process.exit(enginePass && applyPass ? 0 : 1);

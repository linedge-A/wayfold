/**
 * Agent 2 seam harness. Run: node_modules/.bin/tsx modules/trip-brief/run-generate.ts
 * A fresh "from scratch" brief (no pins/bookings) over a Kyoto candidate pool → one proposal.
 */
import { generateFromBrief, type TripBrief } from './generateFromBrief';

const pool: any[] = [
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', lat: 34.9949, lng: 135.7850, priority: 'high', estimatedDurationMin: 90, signals: { bestTime: 'early morning', verdict: 'must' } },
  { id: 'ninenzaka', title: 'Ninenzaka Stroll', category: 'sight', area: 'Higashiyama', lat: 34.9966, lng: 135.7820, estimatedDurationMin: 45 },
  { id: 'gion', title: 'Gion Lantern Walk', category: 'sight', area: 'Gion', lat: 35.0036, lng: 135.7745, estimatedDurationMin: 45, signals: { bestTime: 'evening' } },
  { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', lat: 35.0050, lng: 135.7649, estimatedDurationMin: 60, openingHours: '9 AM - 6 PM' },
  { id: 'pontocho', title: 'Pontocho Dinner', category: 'food', area: 'Central', lat: 35.0042, lng: 135.7706, estimatedDurationMin: 75, openingHours: '5 PM - 11 PM', signals: { bestTime: 'night' } },
  { id: 'kinkakuji', title: 'Kinkaku-ji', category: 'sight', area: 'Northwest', lat: 35.0394, lng: 135.7292, priority: 'high', estimatedDurationMin: 60, signals: { verdict: 'must' } },
  { id: 'ryoanji', title: 'Ryoan-ji', category: 'sight', area: 'Northwest', lat: 35.0345, lng: 135.7183, estimatedDurationMin: 45 },
  { id: 'arashiyama', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', lat: 35.0170, lng: 135.6716, priority: 'high', estimatedDurationMin: 45, signals: { bestTime: 'sunrise', verdict: 'must' } },
  { id: 'tenryuji', title: 'Tenryu-ji', category: 'sight', area: 'Arashiyama', lat: 35.0157, lng: 135.6738, estimatedDurationMin: 50 },
  { id: 'fushimi', title: 'Fushimi Inari', category: 'sight', area: 'South', lat: 34.9671, lng: 135.7727, priority: 'high', estimatedDurationMin: 90, signals: { verdict: 'must' } },
];

const brief: TripBrief = {
  id: 't1', title: 'Kyoto Spring', destination: 'Kyoto, Japan',
  startDate: '2026-04-10', endDate: '2026-04-12', style: 'balanced', transport: 'transit',
};

const r = generateFromBrief(brief, pool);
console.log(`BRIEF: ${brief.title} · ${brief.destination} · ${brief.style} · ${r.itineraryDays.length} days`);
console.log('FLAGS:', r.flags.length ? r.flags : '(none)');
for (const d of r.itineraryDays) {
  console.log(`\n${d.label} · ${d.date || 'flexible'} · ${d.areaSummary ?? '—'}`);
  d.items.forEach((it: any) => console.log(`   ${it.startTime}–${it.endTime}  ${it.title}  [${it.area}]`));
}
console.log('\nPOCKET (overflow →):', r.pocket.map((p: any) => p.title).join(', ') || '(none)');

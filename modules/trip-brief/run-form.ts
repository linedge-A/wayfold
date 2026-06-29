/**
 * Step-3 harness: form payload → brief mapping → one proposal.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-form.ts
 */
import { briefFromForm, generateFromForm, type BriefFormData } from './generateFromBrief';
import type { EngineItem } from '../constraint-engine/planner.ts';

// Harness-local Kyoto candidate pool. In the wired app the real pool comes from the
// seed/pocket candidates (App injects it); an empty pocket yields an empty pool — no
// demo injection (see placeItemsToPool). This fixture exists only to exercise the
// form → brief → proposal path below.
const POOL: EngineItem[] = [
  { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', lat: 34.9949, lng: 135.7850, priority: 'high', estimatedDurationMin: 90, signals: { bestTime: 'early morning', verdict: 'must' } },
  { id: 'ninenzaka', title: 'Ninenzaka Stroll', category: 'sight', area: 'Higashiyama', lat: 34.9966, lng: 135.7820, estimatedDurationMin: 45 },
  { id: 'gion', title: 'Gion Lantern Walk', category: 'sight', area: 'Gion', lat: 35.0036, lng: 135.7745, estimatedDurationMin: 45, signals: { bestTime: 'evening' } },
  { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', lat: 35.0050, lng: 135.7649, estimatedDurationMin: 60, openingHours: '9 AM - 6 PM', tags: ['food', 'market'] },
  { id: 'pontocho', title: 'Pontocho Dinner', category: 'food', area: 'Central', lat: 35.0042, lng: 135.7706, estimatedDurationMin: 75, openingHours: '5 PM - 11 PM', signals: { bestTime: 'night' }, tags: ['food', 'tavern'] },
  { id: 'kinkakuji', title: 'Kinkaku-ji', category: 'sight', area: 'Northwest', lat: 35.0394, lng: 135.7292, priority: 'high', estimatedDurationMin: 60, signals: { verdict: 'must' }, tags: ['zen', 'garden'] },
  { id: 'ryoanji', title: 'Ryoan-ji', category: 'sight', area: 'Northwest', lat: 35.0345, lng: 135.7183, estimatedDurationMin: 45, tags: ['zen', 'garden'] },
  { id: 'arashiyama', title: 'Bamboo Grove', category: 'sight', area: 'Arashiyama', lat: 35.0170, lng: 135.6716, priority: 'high', estimatedDurationMin: 45, signals: { bestTime: 'sunrise', verdict: 'must' } },
  { id: 'tenryuji', title: 'Tenryu-ji', category: 'sight', area: 'Arashiyama', lat: 35.0157, lng: 135.6738, estimatedDurationMin: 50, tags: ['zen', 'garden'] },
  { id: 'fushimi', title: 'Fushimi Inari', category: 'sight', area: 'South', lat: 34.9671, lng: 135.7727, priority: 'high', estimatedDurationMin: 90, signals: { verdict: 'must' }, tags: ['shrine', 'walking'] },
];

const cases: { name: string; form: BriefFormData }[] = [
  { name: 'family + dates + food/zen notes', form: { destinations: ['Kyoto'], dateRange: { start: '2026-04-10', end: '2026-04-12' }, groupSize: { adults: 2, children: 2 }, style: 'relaxing', notes: 'Local ramen hunting and zen temples, kid-friendly' } },
  { name: 'friends, no dates (flexible), intense', form: { destinations: ['Kyoto'], groupSize: { adults: 4, children: 0 }, style: 'intense' } },
  { name: 'solo couple default', form: { destinations: ['Kyoto'], dateRange: { start: '2026-04-10', end: '2026-04-11' }, groupSize: { adults: 1, children: 0 } } },
];

for (const c of cases) {
  const { brief, options } = briefFromForm(c.form);
  const r = generateFromForm(c.form, POOL);
  const stops = r.itineraryDays.reduce((n, d) => n + d.items.length, 0);
  console.log(`\n■ ${c.name}`);
  console.log(`  brief: ${brief.destination} · ${brief.style} · flexible=${brief.flexibleDates}`);
  console.log(`  derived: persona=${options.persona} interests=[${options.interests?.join(', ') || ''}]`);
  console.log(`  → ${r.itineraryDays.length} days, ${stops} stops, ${r.pocket.length} pocket, ${r.flags.length} flags`);
  r.itineraryDays.forEach(d => console.log(`     ${d.label} · ${d.date || 'flexible'} · ${d.areaSummary ?? 'Mixed'} (${d.items.length})`));
}

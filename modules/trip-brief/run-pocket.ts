/**
 * Phase-3 harness: generate FROM the Research Pocket.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-pocket.ts
 * Asserts: must-sees land · skip-verdict excluded · already-scheduled deduped · overflow returns ·
 *          empty pocket yields an empty pool (no Kyoto demo injection) unless a `fill` is passed.
 */
import { placeItemsToPool, type PocketItem } from './placeItemsToPool';
import { generateFromBrief, type TripBrief } from './generateFromBrief';

const pocket: { id: string; title: string; items: PocketItem[] }[] = [
  { id: 'col-sights', title: 'Sights', items: [
    { id: 'kiyomizu', title: 'Kiyomizu-dera', category: 'sight', area: 'Higashiyama', lat: 34.9949, lng: 135.7850, priority: 'high', signals: { verdict: 'must', bestTime: 'early morning' } },
    { id: 'fushimi', title: 'Fushimi Inari', category: 'sight', area: 'South', lat: 34.9671, lng: 135.7727, priority: 'high', signals: { verdict: 'must' } },
    { id: 'ninenzaka', title: 'Ninenzaka Stroll', category: 'sight', area: 'Higashiyama', lat: 34.9966, lng: 135.7820, signals: { verdict: 'recommended' } },
    { id: 'trap', title: 'Overrated Tower', category: 'sight', area: 'Central', lat: 34.9876, lng: 135.7590, signals: { verdict: 'skip' } },
  ] },
  { id: 'col-food', title: 'Food', items: [
    { id: 'nishiki', title: 'Nishiki Market', category: 'food', area: 'Central', lat: 35.0050, lng: 135.7649, openingHours: '9 AM - 6 PM', tags: ['food', 'market'] },
    { id: 'onboard', title: 'Already On Board', category: 'sight', area: 'Gion', lat: 35.0036, lng: 135.7745 },
  ] },
];

const brief: TripBrief = { id: 't', title: 'Kyoto', destination: 'Kyoto', startDate: '2026-04-10', endDate: '2026-04-11', style: 'balanced' };

const pool = placeItemsToPool(pocket, { scheduledIds: ['onboard'] });
console.log('POOL (excl. already-scheduled):', pool.map(p => p.id).join(', '));

const r = generateFromBrief(brief, pool, { persona: 'couple', interests: ['market'] });
const sched = r.itineraryDays.flatMap(d => d.items.map(i => i.id as string));
r.itineraryDays.forEach(d => console.log(`  ${d.label} · ${d.areaSummary}: ${d.items.map(i => i.title).join(', ')}`));
console.log('overflow →', r.pocket.map(p => p.id).join(', ') || '(none)');

const emptyNoFill = placeItemsToPool([], {});
const emptyWithFill = placeItemsToPool([], { fill: pool });
const checks: [string, boolean][] = [
  ['must-sees scheduled', ['kiyomizu', 'fushimi'].every(id => sched.includes(id))],
  ['skip-verdict NOT scheduled', !sched.includes('trap')],
  ['already-scheduled deduped from pool', !pool.some(p => p.id === 'onboard')],
  // Kyoto-in-Paris guard: an empty pocket must NOT inject a demo set — it yields an empty pool…
  ['empty pocket → empty pool (no demo injection)', emptyNoFill.length === 0],
  // …unless the caller explicitly opts into a fallback via `fill`.
  ['empty pocket + explicit fill → uses fill', emptyWithFill.length === pool.length],
];
console.log('\nCHECKS');
let ok = true;
for (const [name, pass] of checks) { console.log(`  ${pass ? '✓' : '✗ FAIL'} ${name}`); ok &&= pass; }
console.log(ok ? '\nALL GREEN' : '\nFAILURES');
if (!ok) process.exit(1);

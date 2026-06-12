/**
 * Preference-prediction test: can the right party/interest inference reproduce a real traveler's
 * actual trip? Same Osaka pool, equal base scores → interest is the ONLY differentiator.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-predict.ts
 * Sources: museumofwander 2-days-in-osaka (food) · wherearethosemorgans osaka-itinerary (sights)
 */
import { generateFromBrief, type TripBrief } from './generateFromBrief';

// 8 candidates, 4 food / 4 sight, all priority 'medium' & no verdict → base score identical.
// Real coords + hours + best-times. `kind` is just for the harness metric.
const pool: any[] = [
  { id: 'kuromon', title: 'Kuromon Market', kind: 'food', category: 'food', area: 'Namba', lat: 34.6657, lng: 135.5061, estimatedDurationMin: 75, openingHours: '9 AM - 5 PM', tags: ['food', 'market'], signals: { bestTime: 'morning' } },
  { id: 'dotonbori', title: 'Dotonbori Street Food', kind: 'food', category: 'food', area: 'Namba', lat: 34.6687, lng: 135.5013, estimatedDurationMin: 90, openingHours: '11 AM - 11 PM', tags: ['food', 'street food'], signals: { bestTime: 'night' } },
  { id: 'shinsekai', title: 'Shinsekai Kushikatsu', kind: 'food', category: 'food', area: 'Shinsekai', lat: 34.6524, lng: 135.5063, estimatedDurationMin: 75, openingHours: '11 AM - 10 PM', tags: ['food', 'tavern'] },
  { id: 'takoyaki', title: 'Takoyaki Juhachiban', kind: 'food', category: 'food', area: 'Namba', lat: 34.6685, lng: 135.5010, estimatedDurationMin: 45, tags: ['food', 'street food'] },
  { id: 'castle', title: 'Osaka Castle', kind: 'sight', category: 'sight', area: 'Castle', lat: 34.6873, lng: 135.5259, estimatedDurationMin: 90, openingHours: '9 AM - 5 PM', ticketed: true, tags: ['history', 'architecture'] },
  { id: 'umeda', title: 'Umeda Sky Building', kind: 'sight', category: 'sight', area: 'Umeda', lat: 34.7052, lng: 135.4897, estimatedDurationMin: 60, openingHours: '9:30 AM - 10:30 PM', tags: ['architecture', 'viewpoint'], signals: { bestTime: 'sunset' } },
  { id: 'shitennoji', title: 'Shitennō-ji Temple', kind: 'sight', category: 'sight', area: 'Tennoji', lat: 34.6543, lng: 135.5166, estimatedDurationMin: 60, openingHours: '8:30 AM - 4:30 PM', tags: ['temple', 'history'] },
  { id: 'shinsaibashi', title: 'Shinsaibashi Shopping', kind: 'sight', category: 'sight', area: 'Namba', lat: 34.6723, lng: 135.5010, estimatedDurationMin: 60, tags: ['shopping'] },
];

const brief: TripBrief = { id: 'osk', title: 'Osaka', destination: 'Osaka', startDate: '2026-11-10', endDate: '2026-11-10', style: 'balanced' }; // 1 day → forces a choice

function plan(label: string, interests: string[], persona: any) {
  const r = generateFromBrief(brief, pool, { interests, persona });
  const sched = r.itineraryDays.flatMap(d => d.items as any[]);
  const food = sched.filter(i => i.kind === 'food').length, sight = sched.filter(i => i.kind === 'sight').length;
  console.log(`\n${label}  [persona=${persona}, interests=${interests.length ? interests.join('/') : 'none'}]`);
  console.log(`  KEPT (${sched.length}): ${sched.map(i => `${i.title}${i.kind === 'food' ? '🍜' : '⛩'}`).join(', ')}`);
  console.log(`  overflow: ${r.pocket.map((p: any) => p.title).join(', ') || '(none)'}`);
  console.log(`  → food ${food} / sight ${sight}  (food share ${Math.round(100 * food / sched.length)}%)`);
  return { food, sight, n: sched.length };
}

console.log('═══ PREFERENCE PREDICTION — same Osaka pool, 1 day, equal base scores ═══');
const A = plan('A · FOODIE  (matches museumofwander food trip)', ['food', 'market', 'street food', 'tavern'], 'couple');
const C = plan('C · GENERIC (no interest inferred)', [], 'couple');
const B = plan('B · CULTURE (matches wherearethosemorgans sights trip)', ['history', 'architecture', 'temple'], 'couple');

console.log('\n─ does the right inference reproduce the right trip? ─');
console.log(`  foodie food-share ${Math.round(100 * A.food / A.n)}%  >  generic ${Math.round(100 * C.food / C.n)}%  >  culture ${Math.round(100 * B.food / B.n)}%  → ${A.food > B.food ? 'YES, interest steers the kept set' : 'NO steering'}`);

console.log('\n═══ PARTY SWEEP — foodie interests, vary the party (pace/dwell) ═══');
for (const p of ['solo', 'couple', 'friends', 'family'] as const) plan(`  ${p}`, ['food', 'market', 'street food', 'tavern'], p);

console.log('\n═══ TIMING (does it honor best-time like the bloggers?) ═══');
const r = generateFromBrief({ ...brief, endDate: '2026-11-11' }, pool, { interests: ['food'], persona: 'friends' }); // 2 days, fit more
for (const d of r.itineraryDays) d.items.forEach((it: any) => {
  const bt = it.signals?.bestTime;
  if (bt) console.log(`  ${it.title} ⟨wants ${bt}⟩ → ${it.startTime}${(/morning/.test(bt) && it.startTime > '11') || (/sunset/.test(bt) && it.startTime < '05:00 PM') || (/night/.test(bt) && it.startTime < '05:00 PM') ? '   ⚠ off' : ''}`);
});

// ── regression gate: the right interest must steer the kept set toward that preference ──
const ok = A.food > C.food && C.food > B.food; // foodie > generic > culture, by food count
console.log(`\n  ${ok ? '✓' : '✗ FAIL'} interest steering monotonic (foodie ${A.food} > generic ${C.food} > culture ${B.food} food kept)`);
if (!ok) process.exit(1);

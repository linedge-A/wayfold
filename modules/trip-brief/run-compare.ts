/**
 * Compare my planner's output against a human blog itinerary built from the SAME places.
 * Run: node_modules/.bin/tsx modules/trip-brief/run-compare.ts
 * Sources: artsy-traveler.com 3-days-in-bangkok · goaskalocal.com 3-day-porto
 */
import { generateFromBrief, type TripBrief } from './generateFromBrief';
import { parseClock } from '../constraint-engine/primitives';
const m = (t?: string) => parseClock(t) ?? -1;

type Row = any;

// ════════════════ BANGKOK — 2 in-city days (blog Day1 + Day2) ════════════════
const bkk: Row[] = [
  { id: 'chatuchak', title: 'Chatuchak Market (weekend-only)', category: 'sight', area: 'Chatuchak', lat: 13.7998, lng: 100.5500, estimatedDurationMin: 120, openingHours: '9 AM - 6 PM', signals: { verdict: 'recommended', bestTime: 'morning' } },
  { id: 'jim-thompson', title: 'Jim Thompson House', category: 'sight', area: 'Pathum Wan', lat: 13.7494, lng: 100.5283, estimatedDurationMin: 75, openingHours: '10 AM - 6 PM' },
  { id: 'mbk', title: 'MBK Food Hall (lunch)', category: 'food', area: 'Pathum Wan', lat: 13.7447, lng: 100.5300, estimatedDurationMin: 60, signals: { bestTime: 'lunch' } },
  { id: 'chinatown', title: 'Chinatown Food Tour', category: 'food', area: 'Chinatown', lat: 13.7400, lng: 100.5100, estimatedDurationMin: 120, openingHours: '5 PM - 12 AM', signals: { verdict: 'must', bestTime: 'night' } },
  { id: 'grand-palace', title: 'Grand Palace + Wat Phra Kaew', category: 'sight', area: 'Rattanakosin', lat: 13.7500, lng: 100.4913, estimatedDurationMin: 150, openingHours: '8:30 AM - 3:30 PM', ticketed: true, queueMin: 25, signals: { verdict: 'must', bestTime: 'morning' } },
  { id: 'wat-pho', title: 'Wat Pho', category: 'sight', area: 'Rattanakosin', lat: 13.7465, lng: 100.4927, estimatedDurationMin: 75, openingHours: '8 AM - 6:30 PM', signals: { verdict: 'must' } },
  { id: 'riverside-lunch', title: 'Riverside Lunch', category: 'food', area: 'Rattanakosin', lat: 13.7435, lng: 100.4895, estimatedDurationMin: 60, signals: { bestTime: 'lunch' } },
  { id: 'massage', title: 'Thai Massage', category: 'sight', area: 'Rattanakosin', lat: 13.7460, lng: 100.4935, estimatedDurationMin: 90 },
  { id: 'dinner-show', title: 'Cultural Dinner Show', category: 'food', area: 'Silom', lat: 13.7230, lng: 100.5340, estimatedDurationMin: 120, openingHours: '6:30 PM - 10 PM', signals: { bestTime: 'night' } },
];
const BKK_BLOG: Record<string, string[]> = {
  'Day 1 (Market/Siam/Chinatown)': ['chatuchak', 'jim-thompson', 'mbk', 'chinatown'],
  'Day 2 (Rattanakosin temples)': ['grand-palace', 'wat-pho', 'riverside-lunch', 'massage', 'dinner-show'],
};

// ════════════════ PORTO — blog Day 1 as a single packed day ════════════════
const porto: Row[] = [
  { id: 'bolhao', title: 'Mercado do Bolhão', category: 'food', area: 'Centro', lat: 41.1496, lng: -8.6066, estimatedDurationMin: 60, openingHours: '8 AM - 8 PM', signals: { bestTime: 'morning' } },
  { id: 'fontainhas', title: 'Miradouro das Fontaínhas', category: 'sight', area: 'Bonfim', lat: 41.1450, lng: -8.5980, stopClass: 'corridor', estimatedDurationMin: 20 },
  { id: 'francesinha', title: 'Francesinha (lunch)', category: 'food', area: 'Centro', lat: 41.1486, lng: -8.6045, estimatedDurationMin: 60, signals: { bestTime: 'lunch' } },
  { id: 'ponte', title: 'Dom Luís I Bridge', category: 'sight', area: 'Ribeira', lat: 41.1399, lng: -8.6094, stopClass: 'corridor', estimatedDurationMin: 20 },
  { id: 'serra-pilar', title: 'Miradouro Serra do Pilar', category: 'sight', area: 'Gaia', lat: 41.1373, lng: -8.6098, stopClass: 'corridor', estimatedDurationMin: 25 },
  { id: 'clerigos', title: 'Clérigos Tower', category: 'sight', area: 'Centro', lat: 41.1456, lng: -8.6139, estimatedDurationMin: 40, openingHours: '9 AM - 7 PM', ticketed: true, queueMin: 10 },
  { id: 'lello', title: 'Lello Bookshop', category: 'sight', area: 'Centro', lat: 41.1469, lng: -8.6149, estimatedDurationMin: 45, openingHours: '9:30 AM - 7 PM', ticketed: true, queueMin: 20, signals: { verdict: 'must' } },
  { id: 'virtudes', title: 'Passeio das Virtudes (sunset)', category: 'sight', area: 'Centro', lat: 41.1487, lng: -8.6207, stopClass: 'corridor', estimatedDurationMin: 25, signals: { verdict: 'must', bestTime: 'sunset' } },
  { id: 'dinner-17th', title: '17º Restaurant (rooftop dinner)', category: 'food', area: 'Centro', lat: 41.1490, lng: -8.6100, estimatedDurationMin: 90, openingHours: '7 PM - 11 PM', signals: { bestTime: 'night' } },
];
const PORTO_BLOG = ['bolhao', 'fontainhas', 'francesinha', 'ponte', 'serra-pilar', 'clerigos', 'lello', 'virtudes', 'dinner-17th'];

function compareClustering(label: string, brief: TripBrief, pool: Row[], blog: Record<string, string[]>) {
  console.log(`\n████ ${label} — MY PLAN vs BLOG ████`);
  const r = generateFromBrief(brief, pool as any, { persona: 'friends' });
  const blogDayOf: Record<string, string> = {};
  Object.entries(blog).forEach(([day, ids]) => ids.forEach(id => (blogDayOf[id] = day)));

  console.log('\nBLOG:');
  Object.entries(blog).forEach(([day, ids]) => console.log(`  ${day}: ${ids.map(id => (pool.find(p => p.id === id)?.title)).join(' → ')}`));

  console.log('\nMINE:');
  const myDayOf: Record<string, number> = {};
  r.itineraryDays.forEach((d, i) => { d.items.forEach((it: any) => (myDayOf[it.id] = i)); console.log(`  Day ${i + 1} · ${d.areaSummary}: ${d.items.map((it: any) => `${it.title} (${it.startTime})`).join(' → ')}`); });
  if (r.pocket.length) console.log('  overflow →', r.pocket.map((p: any) => p.title).join(', '));

  // pairwise same-day agreement (do blog and I agree which places share a day?)
  const ids = pool.map(p => p.id).filter(id => myDayOf[id] !== undefined && blogDayOf[id]);
  let agree = 0, total = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const sameBlog = blogDayOf[ids[i]] === blogDayOf[ids[j]];
    const sameMine = myDayOf[ids[i]] === myDayOf[ids[j]];
    total++; if (sameBlog === sameMine) agree++;
  }
  console.log(`\n  → same-day clustering agreement: ${agree}/${total} pairs (${Math.round(100 * agree / total)}%)`);
  return r;
}

function compareOrdering(label: string, brief: TripBrief, pool: Row[], blogOrder: string[]) {
  console.log(`\n████ ${label} — MY ORDER vs BLOG ORDER (single day) ████`);
  const r = generateFromBrief(brief, pool as any, { persona: 'couple' });
  const mine = r.itineraryDays.flatMap(d => d.items as any[]);
  console.log('\n  BLOG order:', blogOrder.map(id => pool.find(p => p.id === id)?.title?.split(' (')[0]).join(' → '));
  console.log('  MINE       :', mine.map((it: any) => `${it.title.split(' (')[0]} @${it.startTime}`).join('  →  '));
  if (r.pocket.length) console.log('  overflow →', r.pocket.map((p: any) => p.title).join(', '));
  return r;
}

const rBkk = compareClustering('BANGKOK (2 days)', { id: 'b', title: 'Bangkok', destination: 'Bangkok', startDate: '2026-11-10', endDate: '2026-11-11', style: 'balanced' }, bkk, BKK_BLOG);
const rPorto = compareOrdering('PORTO Day 1 (1 day)', { id: 'p', title: 'Porto', destination: 'Porto', startDate: '2026-05-01', endDate: '2026-05-01', style: 'intense' }, porto, PORTO_BLOG);

// corner-case flags vs the blogs
console.log('\n\n════════ WHERE WE DIVERGE (corner cases) ════════');
for (const r of [rBkk, rPorto]) for (const d of r.itineraryDays) for (const it of d.items as any[])
  if (/sunset|aurora/.test(String(it.signals?.bestTime || '')) && m(it.startTime) >= 0 && m(it.startTime) < 17 * 60)
    console.log(`⚠ "${it.title}" — blog times it for sunset; I placed ${it.startTime}`);
console.log('• Chatuchak is weekend-only — neither blog-day logic nor my engine encodes day-of-week (both just trust the user picked a weekend).');

// ── regression gate: my plan must agree with the human blog on the time-of-day backbone ──
const at = (r: typeof rPorto, id: string) => m((r.itineraryDays.flatMap(d => d.items as any[]).find(i => i.id === id) || {}).startTime);
const checks: [string, boolean][] = [
  ['Bangkok finds the Rattanakosin temple cluster (Grand Palace + Wat Pho same day)',
    rBkk.itineraryDays.some(d => d.items.some((i: any) => i.id === 'grand-palace') && d.items.some((i: any) => i.id === 'wat-pho'))],
  ['Porto: morning market first thing (Bolhão before noon)', at(rPorto, 'bolhao') < 12 * 60 && at(rPorto, 'bolhao') >= 0],
  ['Porto: sunset viewpoint at sunset (Virtudes ≥ 6pm)', at(rPorto, 'virtudes') >= 18 * 60],
  ['Porto: dinner at night (17º ≥ 6pm)', at(rPorto, 'dinner-17th') >= 18 * 60],
];
let ok = true;
console.log('\nCHECKS (plan vs human blog backbone)');
for (const [n, p] of checks) { console.log(`  ${p ? '✓' : '✗ FAIL'} ${n}`); ok &&= p; }
if (!ok) process.exit(1);

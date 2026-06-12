/**
 * Optimizer harness — proves the cost-function + hill-climb improves on the greedy seed, per
 * objective. Run: node_modules/.bin/tsx modules/constraint-engine/run-optimize.ts
 *   1. TRANSIT: scattered day-hints → optimizer re-clusters (transit ↓)
 *   2. BUDGET: 'budget' style + cap → sheds/swaps pricey extras, keeps musts (spend ↓, ≤ cap)
 *   3. COMFORT: 'relaxing' overloaded day → rebalances days (comfort ↓)
 * Invariants: locked bookings keep exact day+time · pins and musts never dropped.
 */
import { optimizeItinerary } from './optimize';
import type { PlannerInput } from './planner';

const show = (label: string, r: ReturnType<typeof optimizeItinerary>) => {
  console.log(`\n══ ${label} ══`);
  console.log(`  seed → ${r.seedCost.total}   optimized → ${r.cost.total}   (${r.moves.length} moves, ${r.evals} evals)`);
  console.log(`  transit ${Math.round(r.seedCost.terms.transit)}m→${Math.round(r.cost.terms.transit)}m · misfit ${r.seedCost.terms.timeMisfit.toFixed(1)}h→${r.cost.terms.timeMisfit.toFixed(1)}h · spend ${r.seedCost.spend}→${r.cost.spend} · comfort ${Math.round(r.seedCost.terms.comfort)}→${Math.round(r.cost.terms.comfort)}`);
  r.moves.forEach(mv => console.log(`    · ${mv}`));
  for (const d of [...new Set(r.scheduled.map(s => s.dayId))])
    console.log(`  ${d}: ${r.scheduled.filter(s => s.dayId === d).map(s => `${s.title}@${s.startTime}`).join(' · ')}`);
  if (r.overflow.length) console.log(`  overflow: ${r.overflow.map(o => o.title).join(', ')}`);
  return r;
};

// ── 1. TRANSIT: two areas, hints deliberately interleaved (worst case Tier-1 could hand over) ──
const tIn: PlannerInput = { brief: { style: 'balanced', persona: 'friends' }, dayIds: ['day-1', 'day-2'], pool: [
  { id: 'e1', title: 'East Temple', category: 'sight', area: 'East', lat: 35.000, lng: 135.780, dayId: 'day-1', estimatedDurationMin: 60 },
  { id: 'w1', title: 'West Garden', category: 'sight', area: 'West', lat: 35.020, lng: 135.670, dayId: 'day-1', estimatedDurationMin: 60 },
  { id: 'e2', title: 'East Market', category: 'food', area: 'East', lat: 35.004, lng: 135.776, dayId: 'day-2', estimatedDurationMin: 60, signals: { bestTime: 'lunch' } },
  { id: 'w2', title: 'West Shrine', category: 'sight', area: 'West', lat: 35.017, lng: 135.672, dayId: 'day-2', estimatedDurationMin: 60 },
  { id: 'e3', title: 'East Walk', category: 'sight', area: 'East', lat: 34.998, lng: 135.782, dayId: 'day-2', estimatedDurationMin: 45 },
  { id: 'w3', title: 'West Lunch', category: 'food', area: 'West', lat: 35.019, lng: 135.668, dayId: 'day-1', estimatedDurationMin: 60, signals: { bestTime: 'lunch' } },
] };
const t = show('1 · TRANSIT (interleaved hints)', optimizeItinerary(tIn));

// ── 2. BUDGET: cap 5000, musts + pricey extras + free alternatives ──
const bIn: PlannerInput = { brief: { style: 'budget', persona: 'solo' }, dayIds: ['day-1', 'day-2'], pool: [
  { id: 'must1', title: 'Castle (must)', category: 'sight', area: 'North', lat: 35.01, lng: 135.75, budget: '¥2,000', priority: 'must', estimatedDurationMin: 90 } as any,
  { id: 'teamlab', title: 'Digital Museum', category: 'sight', area: 'North', lat: 35.012, lng: 135.752, budget: '¥3,800', estimatedDurationMin: 120 } as any,
  { id: 'tower', title: 'Observation Tower', category: 'sight', area: 'North', lat: 35.013, lng: 135.748, budget: '¥2,500', estimatedDurationMin: 60 } as any,
  { id: 'park', title: 'Riverside Park', category: 'sight', area: 'North', lat: 35.009, lng: 135.753, budget: 'Free', estimatedDurationMin: 60 } as any,
  { id: 'shrine', title: 'Old Shrine', category: 'sight', area: 'North', lat: 35.011, lng: 135.747, budget: 'Free', estimatedDurationMin: 45 } as any,
  { id: 'market', title: 'Street Market Lunch', category: 'food', area: 'North', lat: 35.0105, lng: 135.751, budget: '¥800', estimatedDurationMin: 60, signals: { bestTime: 'lunch' } } as any,
  { id: 'fancy', title: 'Tasting Menu', category: 'food', area: 'North', lat: 35.0108, lng: 135.7505, budget: '¥9,000', estimatedDurationMin: 120, signals: { bestTime: 'dinner' } } as any,
] };
const b = show('2 · BUDGET (cap ¥5,000)', optimizeItinerary(bIn, { budgetCap: 5000 }));

// ── 3. COMFORT: relaxing style, all hints pile onto day-1, plus a locked booking ──
const cIn: PlannerInput = { brief: { style: 'relaxing', persona: 'family' }, dayIds: ['day-1', 'day-2'], pool: [
  { id: 'book', title: 'Reserved Lunch', category: 'food', area: 'Mid', lat: 35.005, lng: 135.760, dayId: 'day-1', startTime: '12:30 PM', endTime: '01:30 PM', reservationBound: true, pinState: 'hard' },
  { id: 's1', title: 'Aquarium', category: 'sight', area: 'Mid', lat: 35.006, lng: 135.762, dayId: 'day-1', estimatedDurationMin: 90 },
  { id: 's2', title: 'Science Museum', category: 'sight', area: 'Mid', lat: 35.004, lng: 135.758, dayId: 'day-1', estimatedDurationMin: 90 },
  { id: 's3', title: 'City Park', category: 'sight', area: 'Mid', lat: 35.007, lng: 135.761, dayId: 'day-1', estimatedDurationMin: 60 },
  { id: 's4', title: 'Zoo', category: 'sight', area: 'Mid', lat: 35.003, lng: 135.763, dayId: 'day-1', estimatedDurationMin: 90 },
] };
const c = show('3 · COMFORT (overloaded day-1, locked lunch)', optimizeItinerary(cIn));

// ── checks ──
const sched = (r: any, id: string) => r.scheduled.find((s: any) => s.id === id);
const checks: [string, boolean][] = [
  ['1: optimized ≤ seed', t.cost.total <= t.seedCost.total],
  ['1: transit reduced', t.cost.terms.transit < t.seedCost.terms.transit],
  ['2: spend ≤ cap', b.cost.spend <= 5000],
  ['2: must kept', !!sched(b, 'must1')],
  ['2: cheap lunch kept over tasting menu', !!sched(b, 'market') && !sched(b, 'fancy')],
  ['3: comfort improved or equal', c.cost.terms.comfort <= c.seedCost.terms.comfort],
  ['3: locked lunch untouched @12:30 day-1', sched(c, 'book')?.dayId === 'day-1' && sched(c, 'book')?.startTime === '12:30 PM'],
  ['all: deterministic (re-run identical)', JSON.stringify(optimizeItinerary(tIn).scheduled) === JSON.stringify(t.scheduled)],
];
let ok = true;
console.log('\nCHECKS');
for (const [n, p] of checks) { console.log(`  ${p ? '✓' : '✗ FAIL'} ${n}`); ok &&= p; }
console.log(ok ? '\nALL GREEN' : '\nFAILURES'); if (!ok) process.exit(1);

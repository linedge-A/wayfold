/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * optimizeItinerary — a simple, deterministic improvement loop over the greedy planner.
 *
 *   seed = generateItinerary(input)            ← the existing two-pass greedy
 *   repeat (bounded): try moves, keep any that lowers cost(plan)
 *
 * The key simplification: a "move" never edits a timeline. It only edits the INPUT — a day-hint
 * for a flexible item, or an exclude flag — and re-runs generateItinerary, which rebuilds the day
 * around bookings/pins/opening-hours. So every candidate the search looks at is feasible by
 * construction, locked items can never drift, and this file needs zero knowledge of placement.
 *
 * Upgradability: new objectives go in objective.ts (a term + a weight); new move types are one
 * generator entry here; swapping first-improvement for annealing/beam later only touches the
 * accept rule. The engine (planner.ts) is untouched.
 *
 * Move types: move(item→day) · swap(itemA↔itemB across days) · adopt(overflow→day) · drop(item).
 * Never moved/dropped: locked, pinned (soft/hard), verdict/priority 'must'. Drops are skipped
 * entirely under brief.keepAll.
 */
import { generateItinerary, type PlannerInput, type PlannerResult, type EngineItem } from './planner';
import { evaluatePlan, weightsFor, describeCost, parseMoney, type CostWeights, type CostBreakdown } from './objective';
import { parseClock } from './primitives';

export interface OptimizeOptions {
  weights?: Partial<CostWeights>;
  budgetCap?: number;
  maxPasses?: number; // full sweeps over the move list (default 3)
  maxEvals?: number;  // hard cap on planner re-runs (default 1500)
}
export interface OptimizedResult extends PlannerResult {
  cost: CostBreakdown;
  seedCost: CostBreakdown;
  evals: number;
  moves: string[]; // accepted moves, human-readable (for the revision log / copilot)
}

const isMovable = (it: EngineItem): boolean => {
  const hasTime = parseClock(it.startTime) != null;
  if (hasTime && (it.pinState === 'hard' || it.reservationBound === true || it.tripRole === 'anchor')) return false; // locked
  if (it.pinState === 'soft' || it.pinState === 'hard') return false; // user-pinned: keep exactly as the user set it
  return true;
};
const isDroppable = (it: EngineItem): boolean =>
  isMovable(it) && it.priority !== 'must' && String(it.signals?.verdict) !== 'must';

export function optimizeItinerary(input: PlannerInput, opts: OptimizeOptions = {}): OptimizedResult {
  const weights = weightsFor(input.brief.style, opts.weights);
  const maxPasses = opts.maxPasses ?? 3;
  const maxEvals = opts.maxEvals ?? 1500;
  const days = input.dayIds;
  const poolSpend = input.pool.reduce((s, it) => s + (parseMoney((it as any).budget) ?? 0), 0);
  const ctx = { budgetCap: opts.budgetCap, interests: input.brief.interests, poolSpend };

  // Search state = day hints + exclusions, applied over a cloned pool. The planner is the oracle.
  const hint = new Map<string, string | undefined>(input.pool.map(it => [String(it.id), it.dayId]));
  const excluded = new Set<string>();
  let evals = 0;
  const build = (): PlannerResult => {
    evals++;
    const pool = input.pool.filter(it => !excluded.has(String(it.id)))
      .map(it => ({ ...it, dayId: isMovable(it) ? hint.get(String(it.id)) : it.dayId }));
    return generateItinerary({ ...input, pool });
  };

  let best = build();
  const seedCost = evaluatePlan(best, input, weights, ctx);
  let bestCost = seedCost;
  const moves: string[] = [];

  // Deterministic first-improvement hill climb: apply a candidate edit, rebuild, keep iff cheaper.
  const tryEdit = (apply: () => void, undo: () => void, label: string): boolean => {
    if (evals >= maxEvals) return false;
    apply();
    const cand = build();
    const cost = evaluatePlan(cand, input, weights, ctx);
    if (cost.total < bestCost.total - 1e-9) { best = cand; bestCost = cost; moves.push(label); return true; }
    undo();
    return false;
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    const flex = input.pool.filter(it => isMovable(it) && !excluded.has(String(it.id)))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))); // stable order → deterministic

    // 1) MOVE a flexible item to another day
    for (const it of flex) {
      const id = String(it.id), from = hint.get(id);
      for (const d of days) {
        if (d === from) continue;
        if (tryEdit(() => hint.set(id, d), () => hint.set(id, from), `move "${it.title}" → ${d}`)) { improved = true; break; }
      }
    }
    // 2) SWAP two flexible items across days
    for (let i = 0; i < flex.length; i++) for (let j = i + 1; j < flex.length; j++) {
      const a = String(flex[i].id), b = String(flex[j].id);
      const ha = hint.get(a), hb = hint.get(b);
      if (ha === hb) continue;
      if (tryEdit(() => { hint.set(a, hb); hint.set(b, ha); }, () => { hint.set(a, ha); hint.set(b, hb); },
        `swap "${flex[i].title}" ↔ "${flex[j].title}"`)) improved = true;
    }
    // 3) ADOPT an overflow item onto a specific day (give it a hint it may not have had)
    for (const o of best.overflow.filter(isMovable)) {
      const id = String(o.id), from = hint.get(id);
      for (const d of days) {
        if (tryEdit(() => hint.set(id, d), () => hint.set(id, from), `adopt "${o.title}" → ${d}`)) { improved = true; break; }
      }
    }
    // 4) DROP a low-value item (budget/comfort pressure decides via the cost; musts/pins never).
    //    Most expensive first — the cheapest way to get under a cap — and reversible via 5).
    if (!input.brief.keepAll) {
      const droppable = flex.filter(isDroppable)
        .sort((a, b) => (parseMoney((b as any).budget) ?? 0) - (parseMoney((a as any).budget) ?? 0));
      for (const it of droppable) {
        const id = String(it.id);
        if (tryEdit(() => excluded.add(id), () => excluded.delete(id), `drop "${it.title}"`)) improved = true;
      }
      // 5) UNDROP — re-admit an excluded item if the plan is better off with it back (e.g. a free
      //    or cheap stop shed earlier in the pass, before the big-ticket drop got us under cap).
      for (const id of [...excluded].sort()) {
        const it = input.pool.find(p => String(p.id) === id)!;
        if (tryEdit(() => excluded.delete(id), () => excluded.add(id), `re-add "${it.title}"`)) improved = true;
      }
    }
    if (!improved || evals >= maxEvals) break;
  }

  const notes = [...best.notes,
    `optimizer: ${moves.length} move(s), ${evals} eval(s) · seed ${describeCost(seedCost)} → ${describeCost(bestCost)}`];
  return { ...best, notes, cost: bestCost, seedCost, evals, moves };
}

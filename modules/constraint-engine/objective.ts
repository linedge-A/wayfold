/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan objective — ONE pluggable cost function the optimizer minimizes.
 *
 *   cost(plan) = Σ_k  weight_k · term_k(plan)
 *
 * Each term is a small pure function of the finished plan; adding a future objective (CO₂,
 * crowd-avoidance, kid-friendliness…) = write one term + give it a weight. Style/persona pick the
 * weight preset ("budget" cares about spend, "luxury"/"relaxing" about comfort, "intense" about
 * value), and callers can override any weight individually.
 *
 * Terms are heuristics that MIRROR the planner's own models (transit speed, best-time centers) —
 * deliberately self-contained so the objective can evolve (e.g. Google fares/busyness) without
 * touching the placement engine.
 */
import type { EngineItem, PlannerResult, PlannerInput } from './planner';
import { parseClock, haversineKm } from './primitives';

export interface CostWeights {
  transit: number;   // minutes spent moving
  timeMisfit: number;// hours away from an item's stated best time
  budget: number;    // spend (pct of cap, or share of pool spend when no cap)
  comfort: number;   // rushed transitions, overloaded days, long hauls
  variety: number;   // monotone same-category runs
  value: number;     // NEGATIVE: value of what made it onto the plan (dropping a must hurts)
}
export interface CostContext {
  budgetCap?: number;      // total trip cap in the trip's own currency units
  interests?: string[];
  poolSpend?: number;      // Σ parseable spend of the full pool (denominator when no cap)
}
export interface CostBreakdown {
  total: number;
  terms: Record<keyof CostWeights, number>; // raw (unweighted) term values
  spend: number;                            // parsed total spend of the plan
  unknownPrices: number;                    // items whose budget string couldn't be parsed
}

export const WEIGHTS_BY_STYLE: Record<string, CostWeights> = {
  balanced: { transit: 1.0, timeMisfit: 6, budget: 0.5, comfort: 1.0, variety: 1.0, value: 4 },
  budget:   { transit: 1.0, timeMisfit: 4, budget: 3.0, comfort: 0.5, variety: 0.5, value: 3 },
  luxury:   { transit: 1.2, timeMisfit: 8, budget: 0.0, comfort: 3.0, variety: 1.0, value: 4 },
  relaxing: { transit: 1.2, timeMisfit: 6, budget: 0.5, comfort: 2.5, variety: 1.0, value: 3 },
  intense:  { transit: 0.8, timeMisfit: 4, budget: 0.5, comfort: 0.3, variety: 0.5, value: 6 },
};
export const weightsFor = (style?: string, override?: Partial<CostWeights>): CostWeights =>
  ({ ...(WEIGHTS_BY_STYLE[style || 'balanced'] ?? WEIGHTS_BY_STYLE.balanced), ...override });

/** "¥1,500" / "$25" / "Free" / "€10.50" → number; null when unparseable/absent. Currency-agnostic
 *  (assumes one currency per trip — it compares spend, it doesn't convert it). */
export const parseMoney = (s?: string): number | null => {
  if (s == null) return null;
  if (/free|none|^0$/i.test(String(s).trim())) return 0;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ── mirrors of the planner's models (kept local so the objective is independently evolvable) ──
const M = (t?: string) => parseClock(t) ?? -1;
const legMin = (a: EngineItem, b: EngineItem): number => {
  const km = haversineKm(a, b);
  if (km == null) return a.area === b.area ? 10 : 30;
  return Math.max(5, Math.min(90, Math.round((km / 25) * 60 + 3)));
};
const BEST_CENTER: { re: RegExp; t: number }[] = [
  { re: /aurora/, t: 20 * 60 }, { re: /sunset|golden|evening/, t: 18.5 * 60 }, { re: /night/, t: 19 * 60 },
  { re: /breakfast|brunch/, t: 8.5 * 60 }, { re: /sunrise|early|morning/, t: 9.5 * 60 },
  { re: /lunch|midday|noon/, t: 12.5 * 60 }, { re: /dinner/, t: 19 * 60 },
];
const PRI: Record<string, number> = { must: 4, high: 3, medium: 2, low: 1 };
const VER: Record<string, number> = { must: 3, recommended: 2, mixed: 1, skip: -100 };
const itemValue = (it: EngineItem, interests?: string[]): number => {
  let v = (PRI[it.priority || ''] ?? 2) * 2 + (VER[String(it.signals?.verdict)] ?? 0);
  if (interests?.length) {
    const hay = `${(it as any).tags?.join(' ') || ''} ${it.title || ''} ${it.category || ''}`.toLowerCase();
    v += Math.min(interests.filter(i => hay.includes(i.toLowerCase())).length, 2) * 3;
  }
  return v;
};

/** Evaluate a finished plan. Lower is better. */
export function evaluatePlan(result: PlannerResult, input: PlannerInput, weights: CostWeights, ctx: CostContext = {}): CostBreakdown {
  const byDay = new Map<string, EngineItem[]>();
  for (const it of result.scheduled) {
    const k = String(it.dayId);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(it);
  }
  const days = [...byDay.values()].map(list => list.slice().sort((a, b) => M(a.startTime) - M(b.startTime)));

  let transit = 0, timeMisfit = 0, comfort = 0, variety = 0, value = 0, spend = 0, unknownPrices = 0;

  for (const day of days) {
    for (let i = 0; i < day.length; i++) {
      const it = day[i];
      // value of everything that made the plan
      value += itemValue(it, ctx.interests ?? input.brief.interests);
      // spend
      const m = parseMoney((it as any).budget ?? (it as any).price);
      if (m == null) { if ((it as any).budget != null) unknownPrices++; } else spend += m;
      // best-time misfit (hours off the stated moment)
      const bt = String(it.signals?.bestTime || '').toLowerCase();
      if (bt) { const c = BEST_CENTER.find(b => b.re.test(bt)); if (c) timeMisfit += Math.abs(M(it.startTime) - c.t) / 60; }
      if (i === 0) continue;
      // transit + comfort of the transition
      const prev = day[i - 1];
      const leg = legMin(prev, it);
      transit += leg;
      const slack = M(it.startTime) - (M(prev.endTime) >= 0 ? M(prev.endTime) : M(prev.startTime)) - leg;
      if (slack < 0) comfort += 15;            // rushed: scheduled tighter than the leg allows
      else if (slack < 10) comfort += 5;       // tight: no breathing room
      if (leg > 45) comfort += (leg - 45) / 2; // long haul mid-day
    }
    // overloaded day (comfort) — relative to the average load
    // monotony (variety): runs of ≥3 consecutive same-category destinations
    let run = 1;
    for (let i = 1; i < day.length; i++) {
      run = day[i].category === day[i - 1].category && day[i].category !== 'food' ? run + 1 : 1;
      if (run >= 3) variety += 10;
    }
  }
  const loads = days.map(d => d.filter(i => (i.stopClass || 'destination') !== 'corridor').length);
  const avg = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 0;
  for (const l of loads) comfort += Math.max(0, l - avg - 1) * 8;

  // budget term: % over cap when a cap exists; otherwise share of the pool's total spend (so
  // "budget" style steers toward the cheaper subset even without an explicit cap).
  let budget = 0;
  if (ctx.budgetCap && ctx.budgetCap > 0) budget = Math.max(0, spend - ctx.budgetCap) / ctx.budgetCap * 100;
  else if (ctx.poolSpend && ctx.poolSpend > 0) budget = (spend / ctx.poolSpend) * 100;

  const terms: CostBreakdown['terms'] = { transit, timeMisfit, budget, comfort, variety, value };
  const total = weights.transit * transit + weights.timeMisfit * timeMisfit + weights.budget * budget
    + weights.comfort * comfort + weights.variety * variety - weights.value * value;
  return { total: Math.round(total * 10) / 10, terms, spend, unknownPrices };
}

export const describeCost = (c: CostBreakdown): string =>
  `cost ${c.total} (transit ${Math.round(c.terms.transit)}m · misfit ${c.terms.timeMisfit.toFixed(1)}h · ` +
  `spend ${c.spend}${c.terms.budget ? ` [${Math.round(c.terms.budget)}%]` : ''} · comfort ${Math.round(c.terms.comfort)} · ` +
  `variety ${c.terms.variety} · value ${c.terms.value})`;

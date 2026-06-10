/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pacing constants — the ONE source of truth for destinations-per-day, shared by the planner
 * (per-day fill cap, modules/constraint-engine/planner.ts) and trip-brief Tier-1 (flexible-date day
 * sizing, modules/trip-brief/generateFromBrief.ts). Kept here so the two cannot silently disagree.
 */

/** Base destinations/day by trip style. */
export const PACE_BY_STYLE: Record<string, number> = { relaxing: 3, luxury: 3, balanced: 4, budget: 4, intense: 5 };

/** Persona adjustment to the base pace (family slower, friends faster). */
export const PERSONA_PACE_DELTA: Record<string, number> = { family: -1, couple: 0, solo: 0, friends: 1, default: 0 };

/** Resolved destinations/day, clamped to [2, 6] after style + persona adjustment. */
export const paceFor = (style = 'balanced', persona = 'default'): number =>
  Math.max(2, Math.min(6, (PACE_BY_STYLE[style] ?? 4) + (PERSONA_PACE_DELTA[persona] ?? 0)));

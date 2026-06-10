/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Agent 2 — trip brief → generation seam.
 *
 * Maps a TripBrief (contracts.md) onto the constraint-engine's PlannerInput, runs the deterministic
 * planner (Agent 7), and assembles ONE itinerary proposal (`itineraryDays`, the TRIP_GENERATED
 * payload shape). One strong proposal — never alternatives.
 *
 * Two tiers:
 *   Tier-1 (here): cluster the candidate pool by area and route the areas backtrack-free, then
 *                  stamp dayId hints. This is the "first-pass generation logic" Agent 2 owns and
 *                  is what prevents the west→east→west zig-zag a flat fill produces from scratch.
 *   Tier-2 (engine): generateItinerary fills each day — time order, opening hours, transit, pace.
 *
 * Items that already carry a dayId (existing bookings / pins) are left where they are; Tier-1 only
 * places the still-unassigned candidates around them.
 */
import { generateItinerary, type EngineItem, type Persona } from '../constraint-engine/planner.ts';
import { optimizeItinerary, type OptimizeOptions } from '../constraint-engine/optimize.ts';
import { haversineKm } from '../../shared/utils/geo';
import { paceFor } from '../../shared/constants/pacing';

// Local mirrors of the contracts.md shapes — kept here so the module carries no dependency on the
// Agent-9 protected shared/types. A real TripBrief / ItineraryItem is structurally assignable.
export interface TripBrief {
  id: string;
  title: string;
  destination: string;
  startDate?: string;
  endDate?: string;
  flexibleDates?: boolean;
  style?: 'relaxing' | 'balanced' | 'intense' | 'luxury' | 'budget';
  transport?: 'walk' | 'transit' | 'drive' | 'mixed';
  notes?: string;
}
export interface ItineraryDay {
  id: string;
  label: string;
  date: string;
  areaSummary?: string;
  items: EngineItem[];
}
export interface GenerateResult {
  itineraryDays: ItineraryDay[];
  pocket: EngineItem[]; // overflow goes back to the research pocket
  flags: string[];
  notes: string[];
}
export interface GenerateOptions {
  persona?: Persona;    // not part of TripBrief; an engine-only dial (default 'default')
  interests?: string[]; // remembered/derived interests (AGENTS.md or parsed notes) → engine boost
  dayCount?: number;    // explicit override when dates are absent / flexible
  defaultDays?: number; // fallback when no dates/override (default: trip sized to the candidate pool)
  /** Run the cost-function optimizer over the greedy seed (true = style-preset weights; or pass
   *  weights/budgetCap, e.g. { budgetCap: 5000 } for a spend-capped trip). */
  optimize?: boolean | OptimizeOptions;
}

const MS_DAY = 86_400_000;
// Pace (destinations/day) comes from the shared source of truth so Tier-1 fills a day to the exact
// same cap the engine uses — they can no longer drift. See shared/constants/pacing.ts.

// Light value score (priority + blog verdict) for ordering areas/items in Tier-1.
const PRIORITY_W: Record<string, number> = { must: 4, high: 3, medium: 2, low: 1 };
const VERDICT_W: Record<string, number> = { must: 3, recommended: 2, mixed: 1, skip: -100 };
const itemScore = (it: EngineItem): number =>
  (PRIORITY_W[it.priority || ''] ?? 2) + (VERDICT_W[String(it.signals?.verdict)] ?? 0);

/** Inclusive day span between two ISO dates, or null if either is missing/unparseable. */
const daySpan = (start?: string, end?: string): number | null => {
  if (!start || !end) return null;
  const s = Date.parse(start), e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.max(1, Math.round((e - s) / MS_DAY) + 1);
};
/** ISO date `offset` days after `start`, or '' when there is no fixed start (flexible dates). */
const isoDate = (start: string | undefined, offset: number): string => {
  if (!start) return '';
  const s = Date.parse(start);
  if (Number.isNaN(s)) return '';
  return new Date(s + offset * MS_DAY).toISOString().slice(0, 10);
};
/** Most common area among a day's items — the day's "areaSummary" headline. */
const topArea = (items: EngineItem[]): string | undefined => {
  const c: Record<string, number> = {};
  for (const it of items) if (it.area) c[it.area] = (c[it.area] || 0) + 1;
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
};

interface AreaCluster { area: string; items: EngineItem[]; lat?: number; lng?: number; }
/** Group items by area, value-sort within each, then order the areas into a backtrack-free route
 *  (start at the area holding the single highest-value stop, then nearest-neighbour by centroid). */
const routeOrderedAreas = (items: EngineItem[]): AreaCluster[] => {
  const byArea = new Map<string, EngineItem[]>();
  for (const it of items) {
    const k = it.area || '—';
    (byArea.get(k) ?? byArea.set(k, []).get(k)!).push(it);
  }
  const areas: AreaCluster[] = [...byArea.entries()].map(([area, list]) => {
    const pts = list.filter(p => p.lat != null && p.lng != null);
    const lat = pts.length ? pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length : undefined;
    const lng = pts.length ? pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length : undefined;
    return { area, items: list.sort((a, b) => itemScore(b) - itemScore(a)), lat, lng };
  });
  if (areas.length <= 1) return areas;

  let start = 0, best = -Infinity;
  areas.forEach((a, i) => { const s = Math.max(...a.items.map(itemScore)); if (s > best) { best = s; start = i; } });
  const order: AreaCluster[] = [areas[start]];
  const used = new Set([start]);
  let cur = start;
  while (order.length < areas.length) {
    let next = -1, nd = Infinity;
    areas.forEach((a, i) => {
      if (used.has(i)) return;
      const d = haversineKm(areas[cur], a) ?? Number.MAX_SAFE_INTEGER; // no coords → push to the end
      if (d < nd) { nd = d; next = i; }
    });
    if (next < 0) break;
    order.push(areas[next]); used.add(next); cur = next;
  }
  return order;
};

/** Tier-1: stamp dayId on the given items so each day is a contiguous slice of the area route,
 *  filling a day up to `perDay` before moving on (keeping areas whole where possible). */
const clusterAssignDays = (items: EngineItem[], dayIds: string[], perDay: number): void => {
  const ordered = routeOrderedAreas(items);
  const last = dayIds.length - 1;
  const load = dayIds.map(() => 0);
  let di = 0;
  for (const a of ordered) {
    if (load[di] >= perDay && di < last) di++; // start a fresh day for a new area
    for (const it of a.items) {
      if (load[di] >= perDay && di < last) di++; // spill an over-large area into the next day
      it.dayId = dayIds[di];
      load[di]++;
    }
  }
};

export function generateFromBrief(brief: TripBrief, pool: EngineItem[], opts: GenerateOptions = {}): GenerateResult {
  const persona = opts.persona ?? 'default';
  const perDay = paceFor(brief.style, persona);
  // Dates given → honour them. Flexible (no dates) → size the trip to the candidate pool so the
  // plan doesn't leave empty days or cram everything into an arbitrary default.
  const placeable = pool.filter(it => it.signals?.verdict !== 'skip').length || pool.length;
  const flexibleDays = Math.min(14, Math.max(1, Math.ceil(placeable / perDay)));
  const count = Math.max(1, opts.dayCount ?? daySpan(brief.startDate, brief.endDate) ?? opts.defaultDays ?? flexibleDays);
  const dayIds = Array.from({ length: count }, (_, i) => `day-${i + 1}`);

  // Clone so we never mutate the caller's pool. Tier-1 day-assigns only the still-unassigned
  // candidates; anything already bound to a day (bookings/pins) keeps its place.
  const planned = pool.map(it => ({ ...it }));
  clusterAssignDays(planned.filter(it => !it.dayId), dayIds, perDay);

  // Tier-2: the engine fills each day (style passes straight through; persona + interests are dials).
  const plannerInput = { brief: { style: brief.style, persona, interests: opts.interests }, dayIds, pool: planned };
  const result = opts.optimize
    ? optimizeItinerary(plannerInput, opts.optimize === true ? {} : opts.optimize)
    : generateItinerary(plannerInput);

  // Assemble ONE proposal: group the scheduled items into days (engine already time-orders them).
  const fixedStart = brief.flexibleDates ? undefined : brief.startDate;
  const byDay: Record<string, EngineItem[]> = {};
  for (const id of dayIds) byDay[id] = [];
  for (const it of result.scheduled) (byDay[it.dayId as string] ??= []).push(it);

  const itineraryDays: ItineraryDay[] = dayIds.map((id, i) => ({
    id,
    label: `Day ${i + 1}`,
    date: isoDate(fixedStart, i),
    areaSummary: topArea(byDay[id]),
    items: byDay[id],
  }));

  return { itineraryDays, pocket: result.overflow, flags: result.flags, notes: result.notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Form → brief mapping (what the trip-brief modal collects → a TripBrief + dials)
// ─────────────────────────────────────────────────────────────────────────────

/** Raw shape the PlanInitiateModal emits. */
export interface BriefFormData {
  destinations?: string[];
  dateRange?: { start?: string; end?: string };
  groupSize?: { adults?: number; children?: number };
  style?: TripBrief['style'];
  notes?: string;
  flexibleDates?: boolean;
}

// Notes are freeform; pull known interest tokens so the engine can boost matching stops. The engine
// caps the boost, so an over-eager match only nudges — it never overrides a hard signal/pin.
const INTEREST_VOCAB = [
  'food', 'ramen', 'sushi', 'market', 'tavern', 'tasting', 'cafe', 'coffee', 'street food',
  'temple', 'shrine', 'zen', 'garden', 'museum', 'gallery', 'architecture', 'history', 'historic',
  'walking', 'hiking', 'nature', 'scenic', 'viewpoint', 'nightlife', 'shopping', 'onsen', 'art',
];
const extractInterests = (notes?: string): string[] => {
  if (!notes) return [];
  const t = notes.toLowerCase();
  return INTEREST_VOCAB.filter(k => t.includes(k));
};

/** Group composition → engine persona (drives pace + dwell). */
const personaFromGroup = (g?: { adults?: number; children?: number }): Persona => {
  const adults = g?.adults ?? 2, children = g?.children ?? 0;
  if (children > 0) return 'family';
  if (adults >= 4) return 'friends';
  if (adults <= 1) return 'solo';
  if (adults === 2) return 'couple';
  return 'default';
};

/** Map the modal's raw form payload onto a TripBrief plus the engine dials it implies. */
export function briefFromForm(form: BriefFormData, id = `trip-${Date.now()}`): { brief: TripBrief; options: GenerateOptions } {
  const dests = (form.destinations ?? []).map(s => s.trim()).filter(Boolean);
  const hasDates = !!(form.dateRange?.start && form.dateRange?.end);
  const brief: TripBrief = {
    id,
    title: dests[0] ? `${dests[0]} Trip` : 'New Trip',
    destination: dests.join(' → ') || 'Trip',
    startDate: form.dateRange?.start || undefined,
    endDate: form.dateRange?.end || undefined,
    flexibleDates: form.flexibleDates ?? !hasDates,
    style: form.style ?? 'balanced',
    notes: form.notes || undefined,
  };
  return { brief, options: { persona: personaFromGroup(form.groupSize), interests: extractInterests(form.notes) } };
}

/** One-call convenience for the form: raw payload → one itinerary proposal (+ the derived brief). */
export function generateFromForm(form: BriefFormData, pool: EngineItem[]): GenerateResult & { brief: TripBrief } {
  const { brief, options } = briefFromForm(form);
  return { ...generateFromBrief(brief, pool, options), brief };
}

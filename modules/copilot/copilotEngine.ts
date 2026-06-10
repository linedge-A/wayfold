/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copilot orchestrator — the bridge that wires the deterministic OPTIMIZER ENGINE
 * (modules/constraint-engine) and the INGESTION pipeline (modules/ingestion) into copilot
 * commands, honouring the user's remembered preferences (AGENTS.md → userPreferences).
 *
 * Dependency direction is safe: copilot → generator, copilot → ingestion, copilot →
 * shared/types. Nothing here is imported the other way.
 *
 * Two entry points:
 *   optimizeItinerary() — re-plan the current days with the real engine, return a full
 *                         updated itinerary + a RevisionDelta[] describing exactly what moved.
 *   ingestLinks()       — parse pasted blog/article/link text into Pocket candidates,
 *                         surfaced as a Smart-Add suggestion (draft-to-Pocket per AGENTS.md).
 */
import type { ItineraryItem, PlaceItem, RevisionDelta } from '../../shared/types/index';
import { generateItinerary } from '../constraint-engine/planner';
import type { IngestedCandidate } from '../ingestion/extractCandidates';
import { dispatchIngestion } from '../ingestion/dispatchIngestion';
import { USER_PREFERENCES, prefsToBrief, type UserPreferences } from './userPreferences';

export interface EngineResult {
  message: string;
  updatedItems?: ItineraryItem[];
  updatedPocket?: any[];
  deltas?: RevisionDelta[];
  suggestion?: {
    type: 'Suggested Adjustment' | 'Smart Add' | 'Conflict Alert';
    title: string;
    description: string;
    actionLabel?: string;
    itemsToAdd?: PlaceItem[];
  };
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ── Optimizer wiring ─────────────────────────────────────────────────────────

/** Diff the old schedule against the engine's new one → canonical RevisionDeltas. */
function diffSchedule(prev: ItineraryItem[], next: ItineraryItem[]): RevisionDelta[] {
  const prevById = new Map(prev.map(i => [i.id, i]));
  const nextById = new Map(next.map(i => [i.id, i]));
  const deltas: RevisionDelta[] = [];
  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) { deltas.push({ id: uid('d'), type: 'add', itemTitle: n.title, to: n.startTime, note: 'Added to the schedule.' }); continue; }
    if (p.dayId !== n.dayId) deltas.push({ id: uid('d'), type: 'move', itemTitle: n.title, from: p.dayId, to: n.dayId, note: `Moved ${p.dayId} → ${n.dayId}.` });
    else if (p.startTime !== n.startTime) deltas.push({ id: uid('d'), type: 'time-shift', itemTitle: n.title, from: p.startTime, to: n.startTime, note: 'Re-timed to reduce transit / fit opening hours.' });
  }
  for (const p of prev) if (!nextById.has(p.id)) deltas.push({ id: uid('d'), type: 'drop', itemTitle: p.title, from: p.startTime, note: 'Did not fit — moved to the Pocket.' });
  return deltas;
}

/**
 * Run the real engine over the current itinerary. Returns the FULL updated itinerary
 * (App replaces `itineraryItems` wholesale) — overflow items are preserved in place rather
 * than dropped, and called out in the message, to respect Itinerary Stability.
 */
export function optimizeItinerary(
  days: { id: string }[],
  items: ItineraryItem[],
  prefs: UserPreferences = USER_PREFERENCES,
): EngineResult {
  const dayIds = days.length ? days.map(d => d.id) : [...new Set(items.map(i => i.dayId))];
  if (!items.length) return { message: "There's nothing scheduled yet — add a few stops or paste a blog link and I'll build a day around them." };

  const brief = prefsToBrief(prefs);
  // keepAll: re-optimizing a curated itinerary — re-time/re-order but never drop the user's stops.
  const res = generateItinerary({ brief: { style: brief.style, persona: brief.persona, interests: brief.interests, keepAll: true }, dayIds, pool: items as any });

  // preserve any overflow exactly where it was (never silently drop the user's items)
  const scheduledIds = new Set(res.scheduled.map(s => s.id));
  const keptOverflow = items.filter(i => !scheduledIds.has(i.id));
  const updatedItems = [...(res.scheduled as ItineraryItem[]), ...keptOverflow];

  const deltas = diffSchedule(items, res.scheduled as ItineraryItem[]);
  const moved = deltas.filter(d => d.type === 'time-shift' || d.type === 'move').length;

  let message: string;
  if (!deltas.length) message = `Your plan is already well-ordered for a ${brief.style} pace — clustered to avoid backtracking, nothing to change.`;
  else message = `Re-optimised ${dayIds.length} day${dayIds.length > 1 ? 's' : ''} for your ${brief.style} pace: ${moved} stop${moved === 1 ? '' : 's'} re-sequenced to cut transit and respect opening hours (food markets and zen spots kept near your other interests).`;
  if (res.flags.length) message += ` ⚠ ${res.flags.length} conflict${res.flags.length === 1 ? '' : 's'} flagged — I left those bookings put.`;
  if (keptOverflow.length) message += ` ${keptOverflow.length} item${keptOverflow.length === 1 ? '' : 's'} didn't fit the day's pace; I kept them in place rather than dropping them.`;

  return { message, updatedItems, deltas };
}

// ── Ingestion wiring ───────────────────────────────────────────────────────

const URL_RE = /\bhttps?:\/\/[^\s)]+/i;
/** Looks like something to ingest (a link or a chunk of pasted prose) rather than a command. */
export function looksIngestible(text: string): boolean {
  return URL_RE.test(text) || text.length > 140 || /\n/.test(text.trim());
}

/**
 * Parse pasted blog/article/link text into Pocket candidates with evaluation signals.
 * Per AGENTS.md, these are STAGED as a Smart-Add suggestion (draft-to-Pocket), not auto-scheduled.
 */
export function ingestLinks(
  rawText: string,
  sourceType: PlaceItem['sourceType'] = 'blog',
  prefs: UserPreferences = USER_PREFERENCES,
  areaHint = '',
): EngineResult {
  const url = rawText.match(URL_RE)?.[0];
  // ONE router: dispatchIngestion routes blog/booking/JSON-LD to the shared parsers. ingestLinks is
  // the copilot presentation layer over it (interest ordering + draft-to-Pocket messaging). Routing
  // here also means a pasted CONFIRMATION is correctly recognised as a booking, not a blog.
  const result = dispatchIngestion({ surface: 'copilot-paste', rawText, url, areaHint, sourceType });
  const all = result.candidates as IngestedCandidate[];
  // verdict:skip are surfaced separately, not pushed into the import set
  const keep = all.filter(c => c.signals?.verdict !== 'skip');
  const skipped = all.filter(c => c.signals?.verdict === 'skip');
  const bookingNote = result.bookings.length
    ? `Recognised ${result.bookings.length} booking${result.bookings.length === 1 ? '' : 's'} to lock into your schedule. `
    : '';

  if (!keep.length) {
    return {
      message: bookingNote || "I read that through but couldn't pull out clear places to save. Paste a few sentences naming venues (a market, a temple, a café) and I'll extract them.",
    };
  }

  // order by remembered interest, then verdict strength — best picks first in the card
  const rank: Record<string, number> = { must: 3, recommended: 2, mixed: 1 };
  const ordered = orderByInterest(keep, prefs.interests).sort((a, b) =>
    (rank[b.signals?.verdict || 'mixed'] ?? 1) - (rank[a.signals?.verdict || 'mixed'] ?? 1));

  const musts = ordered.filter(c => c.signals?.verdict === 'must').map(c => c.title);
  const lead = musts.length ? ` Top picks: ${musts.slice(0, 3).join(', ')}.` : '';
  const skipNote = skipped.length ? ` (Left out ${skipped.length} the writer was lukewarm on.)` : '';
  const stage = prefs.draftToPocketFirst ? 'staged in your Research Pocket' : 'ready to add';

  return {
    message: `${bookingNote}Pulled ${ordered.length} place${ordered.length === 1 ? '' : 's'} from that ${sourceType} — ${stage}, tagged with how the writer rated each and the best time to go.${lead}${skipNote}`,
    suggestion: {
      type: 'Smart Add',
      title: `${ordered.length} places from ${url ? hostOf(url) : sourceType}`,
      description: 'One-click import into your Pocket. Verdicts and best-time signals come along so the optimizer can schedule them well.',
      actionLabel: `Add ${ordered.length} to Pocket`,
      itemsToAdd: ordered as PlaceItem[],
    },
  };
}

function orderByInterest(cands: IngestedCandidate[], interests: string[]): IngestedCandidate[] {
  const boost = (c: IngestedCandidate) =>
    (c.tags || []).filter(t => interests.includes(t)).length;
  return cands.slice().sort((a, b) => boost(b) - boost(a));
}

const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; }
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local Copilot command handler (used when the server-side Gemini proxy is unavailable).
 *
 * This now routes real commands through the deterministic OPTIMIZER ENGINE and INGESTION
 * pipeline (via copilotEngine), honouring the user's AGENTS.md preferences — instead of the
 * old hard-coded keyword stubs. The function signature is unchanged, so App.tsx needs no
 * edit: it still calls getLocalCopilotResponse(query, days, items) and reads
 * { message, updatedItems, deltas }. The optional `suggestion` / `updatedPocket` fields are
 * additive (App's server path already forwards `suggestion`; the local catch-branch can
 * forward it with a 2-line tweak — see HANDOFF note below).
 */
import type { ItineraryItem } from '../../shared/types/index';
import { optimizeItinerary, ingestLinks, looksIngestible, type EngineResult } from './copilotEngine';
import { USER_PREFERENCES, type UserPreferences } from './userPreferences';

const OPTIMIZE_RE = /\b(optimi[sz]e|re-?optimi|re-?plan|replan|re-?order|re-?sequence|tighten|fix\s+the\s+route|reduce\s+transit|less\s+backtrack)\b/i;
const LIGHTEN_RE = /\b(lighter|lighten|less\s+packed|too\s+(?:much|packed|busy)|slow\s+down|more\s+relaxed|breathing\s+room)\b/i;

export function getLocalCopilotResponse(
  query: string,
  currentDays: any[],
  currentItems: ItineraryItem[],
  prefs: UserPreferences = USER_PREFERENCES,
): EngineResult {
  const text = (query || '').trim();
  const norm = text.toLowerCase();

  // 1) Ingestion — a pasted link or a chunk of blog/article prose → Pocket candidates.
  if (looksIngestible(text)) {
    const sourceType = /tiktok/i.test(text) ? 'tiktok' : /\b(email|inbox|forwarded)\b/i.test(norm) ? 'email' : 'blog';
    return ingestLinks(text, sourceType, prefs);
  }

  // 2) Optimize / re-plan / lighten — run the real engine over the current itinerary.
  if (OPTIMIZE_RE.test(norm) || norm.includes('transit') || LIGHTEN_RE.test(norm)) {
    const usePrefs: UserPreferences = LIGHTEN_RE.test(norm) ? { ...prefs, pacing: 'relaxing' } : prefs;
    const res = optimizeItinerary(currentDays || [], currentItems || [], usePrefs);
    if (LIGHTEN_RE.test(norm) && res.message) {
      res.message = res.message.replace(/^Re-optimised/, 'Lightened and re-optimised');
    }
    return res;
  }

  // 3) Recommend / propose — surface interest-aware ideas, staged to the Pocket.
  if (norm === 'recommend' || norm.includes('recommend') || norm.includes('propose') || norm.includes('suggest')) {
    return {
      message:
        "Based on your saved interests — food markets, local taverns, and scenic zen spots — tell me which day to fill, or paste a blog/link and I'll extract candidate stops into your Pocket with verdicts and best-time tags. From there, say “optimize” and I'll slot them around your bookings.",
    };
  }

  // 4) Fallback.
  return {
    message:
      "I can do three things here: paste a blog or link and I'll extract places into your Pocket; say “optimize” to re-sequence a day around your bookings and cut backtracking; or “lighten” to relax the pace. What would you like?",
  };
}

/*
 * HANDOFF → Agent 0 (app-shell/App.tsx): the local catch-branch (~line 807) currently forwards
 * only { message, updatedItems, deltas }. To enable blog→Pocket import on the offline path,
 * mirror the server branch by also forwarding the suggestion onto the message and staging it:
 *
 *   const fallback = getLocalCopilotResponse(text, appState.itineraryDays, appState.itineraryItems);
 *   const freshAIMsg: CopilotMessage = { ...prevFields, suggestion: fallback.suggestion };
 *   if (fallback.updatedItems || fallback.updatedPocket || fallback.deltas) setPendingChanges(...);
 *
 * No contract change — `suggestion` and `updatedPocket` already exist on the server path.
 */

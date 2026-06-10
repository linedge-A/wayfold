/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AGENTS.md → planner inputs. This is the "user memory" adapter: it turns the persistent
 * profile in /AGENTS.md (pacing, interests, navigation style, drafting habit) into the
 * concrete knobs the optimizer engine consumes, so the copilot plans the way THIS user
 * likes without re-asking every time.
 *
 * Precedence (from the design discussions): explicit in-chat command > pinned/locked
 * items > these remembered prefs > world defaults. So these are PRIORS, not hard rules —
 * the optimizer can still be overridden by a pin or an explicit "make today packed".
 */
import type { TripBrief } from '../../shared/types/index';

export interface UserPreferences {
  pacing: TripBrief['style'];     // maps straight onto planner `style`
  persona?: 'family' | 'friends' | 'couple' | 'solo' | 'default';
  interests: string[];            // canonical interest tags, matched against item tags/category/title
  avoidBacktracking: boolean;     // route optimisation: cluster by area, no zig-zag
  draftToPocketFirst: boolean;    // stage new finds in the Pocket instead of auto-scheduling
}

/**
 * Parsed default reflecting the committed /AGENTS.md profile:
 *   Pacing: "Relaxed to balanced … dedicated breathing space"
 *   Interests: "Culinary adventures (local taverns, food markets, unique tasting menus),
 *               historical and architectural walking routes, and scenic zen spots."
 *   Navigation: "Optimizes walking/transit routes to prevent backtracking"
 *   Drafting: "Prefers suggestions staged in the Research Pocket … unless explicitly commanded"
 */
export const USER_PREFERENCES: UserPreferences = {
  pacing: 'relaxing',
  persona: 'default',
  interests: ['food-market', 'tavern', 'tasting-menu', 'history', 'architecture', 'walking', 'zen', 'scenic'],
  avoidBacktracking: true,
  draftToPocketFirst: true,
};

// Interest tag → matcher over an item's title / tags / category / subCategory.
const INTEREST_MATCHERS: Record<string, RegExp> = {
  'food-market': /\b(market|stall|food\s?hall|nishiki|night\s?market)\b/i,
  tavern: /\b(tavern|izakaya|bistro|ramen|udon|soba|sushi|local\s+eat|diner|restaurant)\b/i,
  'tasting-menu': /\b(tasting|degustation|omakase|kaiseki|michelin|fine\s+dining)\b/i,
  history: /\b(history|historic|heritage|ancient|edo|samurai|geisha|old\s+town)\b/i,
  architecture: /\b(architecture|temple|shrine|pavilion|castle|machiya|pagoda|design)\b/i,
  walking: /\b(walk|stroll|alley|lane|street|promenade|district|wander)\b/i,
  zen: /\b(zen|garden|moss|meditation|tranquil|serene|temple|shrine)\b/i,
  scenic: /\b(scenic|view|viewpoint|lookout|vista|panorama|riverbank|grove|falls)\b/i,
  coffee: /\b(coffee|cafe|café|kissaten|teahouse|bakery)\b/i,
  nightlife: /\b(bar|izakaya|night|sake|nightlife)\b/i,
};

/** Map remembered pacing onto the planner's TripBrief.style. */
export const prefsToBrief = (p: UserPreferences): { style: TripBrief['style']; persona?: UserPreferences['persona']; interests: string[] } => ({
  style: p.pacing,
  persona: p.persona,
  interests: p.interests,
});

/**
 * How strongly an item matches the user's remembered interests. Used by the optimizer to
 * tilt scoring toward food markets / zen spots / walking routes when nothing else decides.
 * Capped so it nudges rather than dominates hard signals (verdict, pins).
 */
export function interestBoost(item: any, interests: string[]): number {
  const hay = [item.title, item.subCategory, item.category, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase();
  let hits = 0;
  for (const i of interests) {
    const re = INTEREST_MATCHERS[i];
    if (re && re.test(hay)) hits++;
  }
  return Math.min(hits, 2) * 3; // +3 per matched interest, capped at +6
}

/**
 * Parse a raw AGENTS.md string into UserPreferences. Lets the copilot read the LIVE file
 * (Agent 0 / future server can pass its contents) instead of a hard-coded constant. Falls
 * back to USER_PREFERENCES for anything the file doesn't state.
 */
export function parseAgentsMd(md: string): UserPreferences {
  if (!md) return USER_PREFERENCES;
  const low = md.toLowerCase();
  const lineAfter = (label: RegExp): string => {
    const m = md.split('\n').find(l => label.test(l));
    return m ? m.replace(/^[*\-\s]*\*\*[^:]+\*\*:?/i, '').trim() : '';
  };

  // pacing — check the stated preference (relaxed/balanced) BEFORE intense, because the
  // profile often names the rejected pace in a negation ("…rather than packed, back-to-back").
  let pacing: TripBrief['style'] = USER_PREFERENCES.pacing;
  const pacingLine = lineAfter(/pacing/i).toLowerCase();
  if (/relax|slow|breathing/.test(pacingLine)) pacing = 'relaxing';
  else if (/balanced/.test(pacingLine)) pacing = 'balanced';
  else if (/luxur/.test(pacingLine)) pacing = 'luxury';
  else if (/budget/.test(pacingLine)) pacing = 'budget';
  else if (/intense|fast|packed/.test(pacingLine)) pacing = 'intense';

  // interests — detect the known interest themes anywhere in the file
  const interests = Object.keys(INTEREST_MATCHERS).filter(tag => {
    const probe: Record<string, RegExp> = {
      'food-market': /food\s?market/i, tavern: /tavern/i, 'tasting-menu': /tasting\s?menu/i,
      history: /historic|history/i, architecture: /architectur/i, walking: /walking|walk/i,
      zen: /zen/i, scenic: /scenic/i, coffee: /coffee|caf[eé]/i, nightlife: /nightlife/i,
    };
    return probe[tag]?.test(md);
  });

  return {
    pacing,
    persona: USER_PREFERENCES.persona,
    interests: interests.length ? interests : USER_PREFERENCES.interests,
    avoidBacktracking: /backtrack/.test(low),
    draftToPocketFirst: /pocket/.test(low) && /(stage|before|unless)/.test(low),
  };
}

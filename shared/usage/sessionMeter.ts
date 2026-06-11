/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-memory, per-SESSION usage meter for metered (server-backed) copilot calls.
 *
 * The counter lives in module scope, so a full page refresh resets it. This is a
 * UX PACING signal for the free tier — it gently caps how many AI actions a user
 * fires before nudging them to refresh / upgrade. It is deliberately NOT a cost
 * control: a refresh resets it and it can be bypassed. The real cost wall is the
 * per-IP rate limit on the proxy (server-security.ts `rateLimit` → 429 scope:ip).
 * See output/backend-proxy-brief.md.
 *
 * Only count a call once it actually reaches the server (a real Gemini hit). Calls
 * that short-circuit client-side (e.g. the "regenerate" command) must NOT be metered.
 */

// Max metered copilot calls per session (per page load). Overridable at build time.
const CONFIGURED = Number((import.meta as any).env?.VITE_FREE_SESSION_COPILOT_CALLS);
const FREE_SESSION_COPILOT_CALLS = Number.isFinite(CONFIGURED) && CONFIGURED > 0 ? CONFIGURED : 5;

let used = 0;

export const sessionMeter = {
  /** Cap for this session (per page load). */
  cap: FREE_SESSION_COPILOT_CALLS,
  /** True while the session still has metered calls left. */
  canUse: (): boolean => used < FREE_SESSION_COPILOT_CALLS,
  /** Record one consumed metered call — call ONLY on a real server hit. */
  record: (): void => { used += 1; },
  /** Metered calls remaining this session. */
  remaining: (): number => Math.max(0, FREE_SESSION_COPILOT_CALLS - used),
  /** Reset the counter (test/util; a page refresh resets it naturally). */
  reset: (): void => { used = 0; },
};

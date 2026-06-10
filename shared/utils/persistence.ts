/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tiny, safe localStorage wrapper for persisting per-trip working state across sessions.
 * Every access is guarded (availability + JSON parse + quota), so a storage failure never
 * breaks the app — reads fall back to the provided default, writes no-op silently.
 */
const NS = 'wayfold';

const storage = (): Storage | null => {
  try {
    // access itself can throw (private mode, sandboxed iframe, disabled storage)
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function loadJSON<T>(key: string, fallback: T): T {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(`${NS}:${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch {
    /* quota exceeded or serialization error — persistence is best-effort, drop silently */
  }
}

/** localStorage key for a trip's Research Pocket, so saved POIs are scoped per trip. */
export const pocketKey = (tripId: string) => `trip:${tripId}:pocket`;

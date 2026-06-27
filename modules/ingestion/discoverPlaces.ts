/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI place discovery — the missing seam that lets a NEW trip populate itself from its destination.
 *
 * Generation is deterministic from the Research Pocket; for a destination with no saved research the
 * pool is empty and the trip comes out empty. This module builds the prompt + parses the model's
 * reply into candidate places that seed that pool (then the existing Google enrichment geocodes them
 * and the planner schedules them). The Gemini CALL lives in the server (reusing the one shared `ai`
 * client); everything risky here — prompt + parse — is pure and unit-tested.
 */
import type { PlaceItem } from '../../shared/types/index';

export interface DiscoverOptions {
  count?: number;
  style?: string;        // relaxing / balanced / intense / luxury / budget
  interests?: string[];  // from AGENTS.md / the trip notes
}

/** A discovered place carries the same evaluation `signals` ingestion produces, so the planner ranks it. */
export interface DiscoveredPlace extends PlaceItem {
  signals?: { verdict?: string; bestTime?: string };
}

export function discoverySystemInstruction(destination: string, opts: DiscoverOptions = {}): string {
  const { count = 10, style, interests } = opts;
  const lens = [
    style ? `for a ${style}-paced trip` : '',
    interests && interests.length ? `favouring: ${interests.join(', ')}` : '',
  ].filter(Boolean).join(', ');
  return (
    `You are a travel planner. List ${count} genuinely notable, REAL places to visit in ${destination}` +
    `${lens ? ' ' + lens : ''}. Mix sights, food and a little nightlife; use REAL, currently-operating place names only.\n` +
    `Return ONLY a JSON array — no prose, no numbering:\n` +
    `[{ "title": string, "category": "food"|"sight"|"stay", "area": string (neighbourhood/district), ` +
    `"tags": string[], "bestTime"?: "morning"|"lunch"|"sunset"|"evening" }]`
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/**
 * Parse the model's reply into candidate places. Tolerant: pulls the JSON array out of any
 * surrounding text, drops malformed/empty entries, de-dupes by title, clamps category. Pure.
 */
export function parseDiscovery(rawText: string, destination: string): DiscoveredPlace[] {
  const m = (rawText || '').match(/\[[\s\S]*\]/);
  let arr: unknown;
  try { arr = m ? JSON.parse(m[0]) : []; } catch { return []; }
  if (!Array.isArray(arr)) return [];

  const seen = new Set<string>();
  const out: DiscoveredPlace[] = [];
  for (const p of arr as any[]) {
    const title = typeof p?.title === 'string' ? p.title.trim() : '';
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category: PlaceItem['category'] = p.category === 'food' || p.category === 'stay' ? p.category : 'sight';
    const bestTime = typeof p.bestTime === 'string' ? p.bestTime : undefined;
    out.push({
      id: `place-disc-${slug(destination)}-${slug(title)}`,
      title,
      category,
      area: typeof p.area === 'string' ? p.area : '',
      tags: Array.isArray(p.tags) ? p.tags.filter((t: unknown) => typeof t === 'string') : [],
      sourceType: 'ai',
      signals: { verdict: 'recommended', ...(bestTime ? { bestTime } : {}) },
    } as DiscoveredPlace);
  }
  return out;
}

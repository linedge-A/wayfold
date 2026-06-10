/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ingestion pipeline — deterministic, front-end, mock-grade-but-real.
 *
 * Turns pasted blog / article / email text (or a saved link's extracted text) into
 * candidate places, ready for one-click bulk import into the Research Pocket
 * (AGENTS.md guardrail: "Link & Blog Extraction → one-click bulk import to Pocket").
 *
 * Beyond the place name, it extracts the *data/comment useful for evaluating the
 * destination* — a verdict (must / recommended / mixed / skip), the best time to go,
 * opening hours, themed tags, and the evidence sentence it came from. Those become the
 * `signals` the optimizer engine reads when it schedules.
 *
 * Output is structurally a `PlaceItem` (so it drops straight into a PocketColumn) plus
 * a few EXTRA optional fields (`signals`, `stopClass`, `evidence`). We attach them as
 * extra properties rather than widening the shared `PlaceItem` type — the optimizer and
 * planner already read them defensively, and Agent 9 owns the canonical contract.
 */
import type { PlaceItem } from '../../shared/types/index';

export type Verdict = 'must' | 'recommended' | 'mixed' | 'skip';

/** Evaluation signals distilled from the prose — what the optimizer scores on. */
export interface PlaceSignals {
  verdict?: Verdict;
  bestTime?: string;        // free text the planner matches: "early morning", "sunset", "lunch"…
  confidence?: number;      // 0..1 — how strong the textual evidence was
  evidence?: string;        // the sentence we lifted it from (for transparency in the Pocket card)
}

/** A PlaceItem plus the extra, non-contract fields ingestion produces. */
export type IngestedCandidate = PlaceItem & {
  signals?: PlaceSignals;
  stopClass?: 'anchor' | 'destination' | 'corridor';
  priority?: 'low' | 'medium' | 'high' | 'must'; // optimizer hint; promoted to ItineraryItem on schedule
};

export interface IngestInput {
  rawText: string;
  sourceType?: PlaceItem['sourceType']; // 'blog' | 'article' | 'email' | 'tiktok' | 'manual' | 'ai'
  sourceUrl?: string;
  areaHint?: string;                     // city / district when the text doesn't name one
}

// ── Lexicons ─────────────────────────────────────────────────────────────────
// A venue noun both DETECTS a place and TYPES it. Order matters: most specific first.
const VENUE_NOUNS: { re: RegExp; category: PlaceItem['category']; tag: string; corridor?: boolean }[] = [
  { re: /\b(night\s?market|food\s?market|market|stalls?|food\s?hall)\b/i, category: 'food', tag: 'food-market' },
  { re: /\b(izakaya|tavern|ramen|udon|soba|sushi|kaiseki|bistro|eatery|diner|restaurant)\b/i, category: 'food', tag: 'tavern' },
  { re: /\b(cafe|café|coffee|kissaten|teahouse|tea\s?house|bakery|patisserie)\b/i, category: 'food', tag: 'coffee' },
  { re: /\b(bar|sake\s?bar|wine\s?bar|brewery)\b/i, category: 'food', tag: 'nightlife' },
  { re: /\b(ryokan|hotel|inn|hostel|guesthouse|guest\s?house)\b/i, category: 'stay', tag: 'stay' },
  { re: /\b(temple|shrine|pagoda|monastery|[a-z]+-?(?:ji|dera|in|gu|jinja|taisha))\b/i, category: 'sight', tag: 'zen' },
  { re: /\b(garden|gardens|park|bamboo\s?grove|forest|riverbank|pond)\b/i, category: 'sight', tag: 'scenic' },
  { re: /\b(museum|gallery|castle|palace|pavilion|tower)\b/i, category: 'sight', tag: 'architecture' },
  { re: /\b(alley|alleyway|lane|street|district|quarter|promenade)\b/i, category: 'sight', tag: 'walking' },
  { re: /\b(lookout|viewpoint|overlook|vista|observation\s?deck|scenic\s?point)\b/i, category: 'sight', tag: 'scenic', corridor: true },
  { re: /\b(falls|waterfall|bridge|gate|torii)\b/i, category: 'sight', tag: 'scenic' },
];

const POSITIVE = /\b(must[-\s]?(?:visit|see|do|try)|don'?t\s+miss|unmissable|highlight|a\s+must|bucket[-\s]?list|world[-\s]?class|stunning|breathtaking|best|favou?rite|iconic|hidden\s+gem|worth\s+the|do\s+not\s+skip)\b/i;
const SOFT_POSITIVE = /\b(recommend|worth\s+a?\s*(?:visit|stop)|lovely|charming|great|delicious|beautiful|pleasant|nice|popular|atmospheric|cozy|cosy)\b/i;
const NEGATIVE = /\b(touristy|overrated|crowded|overpriced|underwhelming|tourist\s+trap|not\s+worth|skip(?:pable)?|disappoint|avoid|too\s+busy|mediocre)\b/i;
const HARD_NEGATIVE = /\b(skip\s+(?:it|this)|don'?t\s+bother|waste\s+of\s+time|avoid\b)\b/i;

// Ordered by specificity: an explicit meal/celestial moment beats a generic "go early".
const TIME_HINTS: { re: RegExp; best: string }[] = [
  { re: /\b(aurora|northern\s+lights)\b/i, best: 'aurora' },
  { re: /\b(sunset|golden\s+hour|dusk|magic\s+hour)\b/i, best: 'sunset' },
  { re: /\b(night|after\s+dark|evening|nightlife|illuminat|lantern|lit\s+up|dinner)\b/i, best: 'evening' },
  { re: /\b(sunrise|first\s+light|dawn)\b/i, best: 'early morning' },
  { re: /\b(lunch|midday|noon|lunchtime)\b/i, best: 'lunch' },
  { re: /\b(early\s+morning|before\s+the\s+crowds|get\s+there\s+early)\b/i, best: 'early morning' },
  { re: /\b(morning|breakfast|brunch)\b/i, best: 'morning' },
];

// extra theme tags that aren't tied to a venue noun
const THEME_TAGS: { re: RegExp; tag: string }[] = [
  { re: /\b(tasting\s+menu|degustation|omakase|michelin|fine\s+dining)\b/i, tag: 'tasting-menu' },
  { re: /\b(zen|meditation|tranquil|serene|peaceful|moss)\b/i, tag: 'zen' },
  { re: /\b(history|historic|heritage|ancient|edo|samurai|geisha)\b/i, tag: 'history' },
  { re: /\b(architecture|design|wooden|machiya|modernist)\b/i, tag: 'architecture' },
  { re: /\b(view|panorama|scenic|overlook|vista)\b/i, tag: 'scenic' },
  { re: /\b(walk|stroll|wander|on\s+foot|promenade)\b/i, tag: 'walking' },
];

const OPENING_HOURS = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:[-–—]|to|until|till)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;
const STOPWORDS = new Set(['The', 'A', 'An', 'This', 'That', 'It', 'We', 'I', 'You', 'They', 'Day', 'Our', 'My', 'Here', 'There', 'Then', 'After', 'Before', 'Next', 'Also', 'But', 'And', 'For', 'From', 'To', 'In', 'On', 'At', 'If', 'When', 'While', 'One', 'Most', 'Some', 'Many']);

const splitSentences = (t: string): string[] =>
  t.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);

// Pull a proper-noun place phrase out of a sentence, anchored on a venue noun when present.
const properNounNear = (sentence: string): string | null => {
  // sequences of Capitalized words (allow hyphen, &, of/the/no connectors), 1..5 words
  const re = /\b([A-Z][a-zà-ÿ'’.]+(?:[-\s](?:of|the|no|de|du|la|le)?[-\s]?[A-Z][a-zà-ÿ'’.]+){0,4})\b/g;
  const cands: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const phrase = m[1].replace(/\s+/g, ' ').trim();
    const firstWord = phrase.split(' ')[0];
    if (STOPWORDS.has(firstWord) && phrase.split(' ').length === 1) continue;
    cands.push(phrase);
  }
  if (!cands.length) return null;
  // prefer the phrase that contains/abuts a venue noun, else the longest proper noun
  const withVenue = cands.find(c => VENUE_NOUNS.some(v => v.re.test(c)));
  return withVenue || cands.sort((a, b) => b.length - a.length)[0];
};

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s: string) => normKey(s).replace(/\s+/g, '-').slice(0, 40);

function readSignals(sentence: string): PlaceSignals {
  let verdict: Verdict | undefined;
  let confidence = 0.3;
  if (HARD_NEGATIVE.test(sentence)) { verdict = 'skip'; confidence = 0.85; }
  else if (POSITIVE.test(sentence)) { verdict = 'must'; confidence = 0.85; }
  else if (NEGATIVE.test(sentence)) { verdict = 'mixed'; confidence = 0.6; }
  else if (SOFT_POSITIVE.test(sentence)) { verdict = 'recommended'; confidence = 0.6; }
  const t = TIME_HINTS.find(h => h.re.test(sentence));
  return { verdict, bestTime: t?.best, confidence, evidence: sentence.slice(0, 240) };
}

function typeOf(phrase: string, sentence: string): { category: PlaceItem['category']; tags: string[]; corridor: boolean } {
  const tags = new Set<string>();
  let category: PlaceItem['category'] = 'sight';
  let corridor = false;
  const hit = VENUE_NOUNS.find(v => v.re.test(phrase) || v.re.test(sentence));
  if (hit) { category = hit.category; tags.add(hit.tag); corridor = !!hit.corridor; }
  for (const th of THEME_TAGS) if (th.re.test(sentence) || th.re.test(phrase)) tags.add(th.tag);
  return { category, tags: [...tags], corridor };
}

type Priority = 'low' | 'medium' | 'high' | 'must';
const priorityFromVerdict = (v?: Verdict): Priority =>
  v === 'must' ? 'high' : v === 'recommended' ? 'medium' : 'low';

/**
 * Extract candidate places from free text. Deterministic and side-effect-free.
 * Merges repeated mentions of the same place (strongest verdict + union of tags wins).
 */
export function extractCandidates(input: IngestInput): IngestedCandidate[] {
  const { rawText, sourceType = 'blog', sourceUrl, areaHint = '' } = input;
  if (!rawText || !rawText.trim()) return [];

  const byKey = new Map<string, IngestedCandidate>();
  const verdictRank: Record<Verdict, number> = { skip: 0, mixed: 1, recommended: 2, must: 3 };

  for (const sentence of splitSentences(rawText)) {
    const phrase = properNounNear(sentence);
    if (!phrase) continue;
    const hasVenue = VENUE_NOUNS.some(v => v.re.test(phrase) || v.re.test(sentence));

    const key = normKey(phrase);
    const sig = readSignals(sentence);
    const { category, tags, corridor } = typeOf(phrase, sentence);
    // keep only real places: a venue noun, OR a usable signal/tag. Drops bare title-case
    // noise like "Perfect Day" that names no venue and carries no verdict/time/theme.
    if (!hasVenue && !sig.verdict && !sig.bestTime && tags.length === 0) continue;
    const hoursM = sentence.match(OPENING_HOURS);
    const openingHours = hoursM ? `${hoursM[1].trim()} - ${hoursM[2].trim()}` : undefined;

    const existing = byKey.get(key);
    if (existing) {
      // merge: keep strongest verdict, union tags, fill missing fields
      const exV = existing.signals?.verdict, newV = sig.verdict;
      if (newV && (!exV || verdictRank[newV] > verdictRank[exV])) {
        existing.signals = { ...existing.signals, ...sig };
      }
      if (sig.bestTime && !existing.signals?.bestTime) existing.signals!.bestTime = sig.bestTime;
      existing.tags = [...new Set([...(existing.tags || []), ...tags])];
      if (openingHours && !existing.openingHours) existing.openingHours = openingHours;
      if (corridor) existing.stopClass = 'corridor';
      continue;
    }

    byKey.set(key, {
      id: `ingest-${slug(phrase)}-${sourceType}`,
      title: phrase,
      category,
      area: areaHint,
      sourceType,
      tags,
      openingHours,
      priority: priorityFromVerdict(sig.verdict),
      tripRole: sig.verdict === 'must' ? 'supporting' : 'optional',
      ...(corridor ? { stopClass: 'corridor' as const } : {}),
      signals: sig,
      ...(sourceUrl ? { website: sourceUrl } : {}),
      editorialSummary: sig.evidence,
    });
  }

  // drop verdict:skip from the import set, but keep them out rather than hiding silently
  return [...byKey.values()];
}

/** Convenience: split a batch into the two Pocket columns App.tsx routes to. */
export function partitionForPocket(cands: IngestedCandidate[]) {
  return {
    foodDrink: cands.filter(c => c.category === 'food'),
    mustSee: cands.filter(c => c.category !== 'food'),
  };
}

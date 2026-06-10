/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * dispatchIngestion — the single, surface-agnostic front door for ingestion (P1, pure).
 *
 * Every capture surface (copilot paste, forward-to-inbox, file upload, future Chrome extension)
 * normalizes into an `IngestionRequest` and calls this. It only ROUTES to the parsers that already
 * exist — it does not re-implement parsing, geocoding, or committing:
 *   jsonld present        → parseJsonLd            (high-fidelity; the extension's path)
 *   text looks like a booking → parseBookingEmail + toArtifacts
 *   otherwise (blog/place) → extractCandidates
 *
 * Enrichment (lat/lng, hours, rating) and the Pocket commit are deliberately NOT done here — the
 * candidates ride out as the existing `suggestion.itemsToAdd`, so App's `handleApplySug` +
 * `enrichItemWithPlaceData` (→ `fetchPlaceSnapshot`) fire unchanged. One core, no forked wheels.
 *
 * NOTE: `IngestionRequest`/`IngestionResult` are kept module-local for the prototype. They should
 * graduate to `shared/types` via Agent 9 once stable (see the design doc).
 */
import type { BookingRecord, ItineraryItem, PlaceItem, CopilotMessage } from '../../shared/types/index';
import { extractCandidates } from './extractCandidates';
import { looksLikeBooking, parseBookingEmail, toArtifacts } from './parseBookingEmail';
import { parseJsonLd } from './parseJsonLd';

export type IngestionSurface = 'copilot-paste' | 'forward-inbox' | 'upload' | 'extension';
export type IngestionContent = 'text' | 'html' | 'ics' | 'jsonld';

export interface IngestionRequest {
  surface: IngestionSurface;
  content?: IngestionContent;
  rawText?: string;          // text / .ics / .eml body
  jsonld?: unknown[];        // schema.org nodes harvested from a page (extension) or an email's HTML
  url?: string;
  pageTitle?: string;
  areaHint?: string;
  sourceType?: PlaceItem['sourceType'];
}

export interface IngestionResult {
  bookings: { record: BookingRecord; items: ItineraryItem[] }[];
  candidates: PlaceItem[];
  warnings: string[];
  source: { surface: IngestionSurface; url?: string };
}

export function dispatchIngestion(req: IngestionRequest): IngestionResult {
  const warnings: string[] = [];
  const bookings: IngestionResult['bookings'] = [];
  let candidates: PlaceItem[] = [];
  const areaHint = req.areaHint ?? '';

  // 1) JSON-LD — highest fidelity. Bookings AND place candidates in one shot.
  if (req.jsonld && req.jsonld.length) {
    const { bookings: pbs, candidates: cands } = parseJsonLd(req.jsonld, areaHint);
    pbs.forEach(pb => bookings.push(toArtifacts(pb)));
    candidates = candidates.concat(cands as PlaceItem[]);
  }

  const text = (req.rawText || '').trim();
  if (text) {
    // 2) Booking-shaped text / .ics → records + locked anchors.
    if (req.content === 'ics' || looksLikeBooking(text)) {
      const parsed = parseBookingEmail(text);
      if (parsed.length) parsed.forEach(pb => bookings.push(toArtifacts(pb)));
      else warnings.push('Looked like a booking but nothing parsed cleanly.');
    } else {
      // 3) Blog / article / place list → Pocket candidates.
      candidates = candidates.concat(
        extractCandidates({ rawText: text, sourceType: req.sourceType ?? 'blog', sourceUrl: req.url, areaHint }) as PlaceItem[],
      );
    }
  }

  // de-dupe bookings by record id and candidates by id (same place via JSON-LD + text)
  dedupeById(bookings, b => b.record.id);
  candidates = dedupeReturn(candidates, c => c.id);

  if (!bookings.length && !candidates.length) warnings.push('No bookings or places found.');
  return { bookings, candidates, warnings, source: { surface: req.surface, url: req.url } };
}

/**
 * Adapt the place candidates into the EXISTING copilot suggestion shape, so the unchanged
 * App.handleApplySug path commits them to the Pocket and fires Google enrichment. Bookings are
 * returned separately (they need the booking-records apply, Agent 8) — summarized in the message.
 */
export function toSuggestion(result: IngestionResult): { message: string; suggestion?: NonNullable<CopilotMessage['suggestion']>; bookings: IngestionResult['bookings'] } {
  const parts: string[] = [];
  if (result.bookings.length) parts.push(`${result.bookings.length} booking${result.bookings.length === 1 ? '' : 's'} (locked into your schedule)`);
  if (result.candidates.length) parts.push(`${result.candidates.length} place${result.candidates.length === 1 ? '' : 's'} (staged in your Pocket)`);
  const message = parts.length ? `Captured ${parts.join(' and ')}.` : (result.warnings[0] || 'Nothing to import.');

  const suggestion = result.candidates.length
    ? {
        type: 'Smart Add' as const,
        title: `${result.candidates.length} place${result.candidates.length === 1 ? '' : 's'} to your Pocket`,
        description: 'One-click import. Google details (location, hours, rating) fill in on add.',
        actionLabel: `Add ${result.candidates.length} to Pocket`,
        itemsToAdd: result.candidates,
      }
    : undefined;
  return { message, suggestion, bookings: result.bookings };
}

function dedupeById<T>(arr: T[], key: (t: T) => string): void {
  const seen = new Set<string>();
  for (let i = arr.length - 1; i >= 0; i--) { const k = key(arr[i]); if (seen.has(k)) arr.splice(i, 1); else seen.add(k); }
}
function dedupeReturn<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>(); const out: T[] = [];
  for (const x of arr) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Booking-email ingestion — P0 prototype (deterministic, front-end, no deps).
 *
 * Turns a pasted/forwarded confirmation (flight, hotel, rail, restaurant, car, ticket) or an
 * attached `.ics` into a normalized `ParsedBooking`, then maps it onto the EXISTING contracts:
 * one `BookingRecord` (wallet) + one or more `reservationBound` itinerary blocks (locked anchors
 * the optimizer plans around). See output/research-booking-email-ingestion.md.
 *
 * P0 scope, on purpose:
 *   ✓ `.ics` VEVENT parsing (highest signal)
 *   ✓ heuristic NL parsing for the common confirmation shapes
 *   ✓ booking-vs-blog classifier (so the copilot paste path routes here, not to the blog extractor)
 *   ✓ mapper that uses ONLY existing BookingRecord/ItineraryItem fields → no contract change needed
 *   ⟂ deferred to P1: schema.org JSON-LD extraction, Gemini fallback, cancellation/update handling
 *      (richer fields — status, tz, from/to, ISO datetimes — await the Agent 9 contract proposal in
 *       output/contract-proposal-bookingrecord.md; until then they ride along in `note`)
 */
import type { BookingRecord, ItineraryItem } from '../../shared/types/index';

export type BookingType = 'flight' | 'lodging' | 'rail' | 'restaurant' | 'car' | 'activity' | 'ticket';

export interface BookingPlace { dateTimeLocal?: string; place?: string; code?: string; lat?: number; lng?: number; }
export interface BookingSegment { start: BookingPlace; end?: BookingPlace; label?: string; }

/** Normalized intermediate — source-agnostic. */
export interface ParsedBooking {
  type: BookingType;
  vendor?: string;
  locator?: string;                 // PNR / confirmation code
  status: 'confirmed' | 'cancelled' | 'changed' | 'pending';
  segments: BookingSegment[];
  party?: number;
  price?: string;
  cancelable?: boolean;
  title: string;
  confidence: number;               // 0..1
  sourceEmailId: string;            // idempotency key
  raw?: string;                     // trimmed evidence
}

/** Existing-contract artifacts the rest of the app consumes (P0 uses no new fields). */
export interface BookingArtifacts {
  record: BookingRecord;
  items: (ItineraryItem & { sourceType: 'email'; reservationBound: true })[];
}

// ── classification ────────────────────────────────────────────────────────────
const TYPE_HINTS: { re: RegExp; type: BookingType; cat: BookingRecord['category'] }[] = [
  { re: /\b(flight|airline|boarding|gate|departure|pnr|e-?ticket|seat\s+\d|baggage|airways|air\s+lines?)\b/i, type: 'flight', cat: 'transport' },
  { re: /\b(hotel|check-?in|check-?out|nights?\b|room|ryokan|airbnb|booking\.com|reservation\s+at\s+the)\b/i, type: 'lodging', cat: 'hotel' },
  { re: /\b(train|rail|platform|coach|shinkansen|eurostar|amtrak|carriage|seat\s+car)\b/i, type: 'rail', cat: 'transport' },
  { re: /\b(table\s+for|party\s+of|reservation\s+(?:for|at)|dining|restaurant|covers|seating)\b/i, type: 'restaurant', cat: 'restaurant' },
  { re: /\b(car\s+rental|rental\s+car|pick-?up|drop-?off|hertz|avis|europcar|vehicle)\b/i, type: 'car', cat: 'transport' },
  { re: /\b(ticket|admission|entry|tour|pass|booking\s+confirmed)\b/i, type: 'ticket', cat: 'ticket' },
];

const BOOKING_SIGNALS = /\b(confirm(?:ed|ation)?|booking|reservation|itinerary|e-?ticket|pnr|reference|locator|check-?in|boarding)\b/i;
const LOCATOR_PATTERNS = [
  /\b(?:confirmation(?:\s+(?:code|number|#))?|booking\s+(?:ref(?:erence)?|number|id)|reservation\s+(?:code|number)|pnr|record\s+locator|locator|reference)\s*[:#]?\s*([A-Z0-9]{5,10})\b/i,
  /\b([A-Z0-9]{6})\b(?=.*\b(?:pnr|locator|confirmation)\b)/i,
];
const FLIGHT_NO = /\b([A-Z]{2}\s?\d{2,4})\b/;
const AIRPORT = /\b([A-Z]{3})\b/g;
const TIME_RE = /\b(\d{1,2}:\d{2}\s?(?:AM|PM)?)\b/i;
const MONEY = /([$€£¥]\s?\d[\d,.]*)/;
const PARTY = /\b(?:party\s+of|table\s+for|for)\s+(\d{1,2})\b/i;

/** Quick gate for the copilot paste path: is this a booking, not a blog/link? */
export function looksLikeBooking(text: string): boolean {
  if (!text) return false;
  if (/BEGIN:VEVENT/i.test(text)) return true;
  const signal = BOOKING_SIGNALS.test(text);
  const hasLocator = LOCATOR_PATTERNS.some(re => re.test(text));
  const typed = TYPE_HINTS.some(h => h.re.test(text));
  return (signal && (hasLocator || typed)) || (hasLocator && typed);
}

// ── date/time helpers ─────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

/** Best-effort date → ISO 'YYYY-MM-DD'. Handles "April 15, 2026", "15 Apr 2026", "2026-04-15", "15/04/2026". */
function parseDate(s: string): string | undefined {
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m) { const mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[2])}`; }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (m) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) return `${m[3]}-${pad(mo)}-${pad(+m[1])}`; }
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`; // assume DD/MM/YYYY
  return undefined;
}

const norm12h = (t?: string): string | undefined => {
  if (!t) return undefined;
  const m = t.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return undefined;
  let h = +m[1]; const mn = +m[2];
  if (m[3] === 'PM' && h < 12) h += 12; if (m[3] === 'AM' && h === 12) h = 0;
  const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12;
  return `${pad(hh)}:${pad(mn)} ${ap}`;
};

const hashId = (s: string): string => {
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return 'bk-' + (h >>> 0).toString(36);
};

// ── .ics ────────────────────────────────────────────────────────────────────
function unfoldIcs(text: string): string[] {
  return text.replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n');
}
function parseIcsDate(v: string): string | undefined {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4]) { let h = +m[4]; const mn = +m[5]; const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12; return `${date} ${pad(hh)}:${pad(mn)} ${ap}`; }
  return date;
}
export function parseIcs(text: string): ParsedBooking[] {
  const lines = unfoldIcs(text);
  const out: ParsedBooking[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (/^BEGIN:VEVENT/i.test(line)) cur = {};
    else if (/^END:VEVENT/i.test(line) && cur) {
      const summary = cur.SUMMARY || 'Booking';
      const startRaw = cur.DTSTART || '';
      const endRaw = cur.DTEND || '';
      const type = (TYPE_HINTS.find(h => h.re.test(summary + ' ' + (cur!.DESCRIPTION || '')))?.type) || 'activity';
      out.push({
        type, status: 'confirmed', title: summary,
        locator: cur.UID?.split('@')[0],
        segments: [{ start: { dateTimeLocal: parseIcsDate(startRaw), place: cur.LOCATION }, end: endRaw ? { dateTimeLocal: parseIcsDate(endRaw) } : undefined }],
        confidence: 0.95, sourceEmailId: hashId('ics|' + (cur.UID || summary + startRaw)), raw: cur.DESCRIPTION,
      });
      cur = null;
    } else if (cur) {
      const m = line.match(/^([A-Z]+)(?:;[^:]*)?:(.*)$/);
      if (m) cur[m[1].toUpperCase()] = m[2].trim();
    }
  }
  return out;
}

// ── NL heuristic ──────────────────────────────────────────────────────────────
function detectType(text: string): { type: BookingType; cat: BookingRecord['category'] } {
  return TYPE_HINTS.find(h => h.re.test(text)) ?? { type: 'ticket', cat: 'ticket' };
}
function findLocator(text: string): string | undefined {
  for (const re of LOCATOR_PATTERNS) { const m = text.match(re); if (m) return m[1].toUpperCase(); }
  return undefined;
}
export function parseBookingText(text: string): ParsedBooking | null {
  if (!looksLikeBooking(text)) return null;
  const { type } = detectType(text);
  const locator = findLocator(text);
  const date = parseDate(text);
  const time = norm12h(text.match(TIME_RE)?.[1]);
  const dateTimeLocal = date ? (time ? `${date} ${time}` : date) : undefined;

  let label: string | undefined, place: string | undefined, code: string | undefined, end: BookingPlace | undefined;
  if (type === 'flight') {
    label = text.match(FLIGHT_NO)?.[1]?.replace(/\s+/, ' ');
    // prefer the explicit "from XXX to YYY" routing; only then fall back to a scan
    const fromTo = text.match(/\bfrom\s+([A-Z]{3})\b[\s\S]*?\bto\s+([A-Z]{3})\b/i);
    if (fromTo) { code = fromTo[1].toUpperCase(); end = { code: fromTo[2].toUpperCase() }; }
    else {
      // common airline 3-letter names that are NOT airports, so a bare scan doesn't mistake them
      const STOP = new Set(['THE', 'AND', 'YOU', 'PNR', 'ETA', 'SEAT', 'FARE', 'NEW', 'YOUR', 'ANA', 'JAL', 'AIR']);
      const airlinePrefix = label?.slice(0, 2).toUpperCase();
      const codes = [...text.matchAll(AIRPORT)].map(m => m[1]).filter(c => !STOP.has(c) && c !== airlinePrefix);
      if (codes[0]) code = codes[0];
      if (codes[1]) end = { code: codes[1] };
    }
  } else if (type === 'lodging') {
    place = text.match(/\b((?:[A-Z][\w'’]+\s+){0,2}(?:Hotel|Inn|Ryokan|Resort|Hostel|Lodge|Guesthouse)(?:\s+[A-Z][\w'’]+){0,2})\b/)?.[1]?.trim()
      || text.match(/\b(?:at|in)\s+([A-Z][\w'’]+(?:\s+[A-Z][\w'’]+){0,3})/)?.[1];
  } else {
    place = text.match(/\b(?:at|in)\s+([A-Z][\w'’]+(?:\s+[A-Z][\w'’]+){0,3})/)?.[1];
  }
  const vendor = text.match(/\b(ANA|JAL|United|Delta|British Airways|Lufthansa|Booking\.com|Airbnb|Hertz|Avis|Eurostar|Amtrak|Marriott|Hilton)\b/i)?.[1];
  const party = text.match(PARTY)?.[1];
  const price = text.match(MONEY)?.[1];
  const cancelable = /\b(free\s+cancellation|cancel(?:lable)?\s+(?:until|free)|fully\s+refundable)\b/i.test(text) ? true
    : /\b(non-?refundable|no\s+cancellation|cannot\s+be\s+cancel)\b/i.test(text) ? false : undefined;

  const titleBase = vendor ? `${vendor} ${type}` : type[0].toUpperCase() + type.slice(1);
  const title = label ? `${titleBase} ${label}` : place ? `${titleBase} — ${place}` : titleBase;

  const confidence = (locator ? 0.4 : 0) + (dateTimeLocal ? 0.3 : 0) + (label || place || code ? 0.2 : 0) + 0.1;
  return {
    type, vendor, locator, status: 'confirmed',
    segments: [{ start: { dateTimeLocal, place, code }, end, label }],
    party: party ? +party : undefined, price, cancelable,
    title, confidence: Math.min(1, confidence),
    sourceEmailId: hashId(`${type}|${locator || ''}|${dateTimeLocal || ''}|${label || place || ''}`),
    raw: text.slice(0, 240),
  };
}

/** Top-level: parse `.ics` if present, else NL. Returns 0..n bookings. */
export function parseBookingEmail(rawText: string): ParsedBooking[] {
  if (!rawText?.trim()) return [];
  if (/BEGIN:VEVENT/i.test(rawText)) return parseIcs(rawText);
  const one = parseBookingText(rawText);
  return one ? [one] : [];
}

// ── map onto existing contracts (no new fields) ─────────────────────────────────
const CAT_FOR: Record<BookingType, BookingRecord['category']> = {
  flight: 'transport', rail: 'transport', car: 'transport', lodging: 'hotel', restaurant: 'restaurant', activity: 'ticket', ticket: 'ticket',
};
const ITEM_CAT: Record<BookingType, ItineraryItem['category']> = {
  flight: 'transit', rail: 'transit', car: 'transit', lodging: 'stay', restaurant: 'food', activity: 'sight', ticket: 'sight',
};

/** ParsedBooking → { BookingRecord, reservationBound ItineraryItem[] }, using only existing fields. */
export function toArtifacts(pb: ParsedBooking): BookingArtifacts {
  const itemId = `place-${pb.sourceEmailId}`;
  const seg = pb.segments[0];
  const [date, ...t] = (seg.start.dateTimeLocal || '').split(' ');
  const time = t.join(' ') || undefined;

  // richer-than-contract details preserved in `note` until the schema proposal lands (Agent 9)
  const noteBits = [
    pb.vendor && `vendor: ${pb.vendor}`,
    seg.label && `ref: ${seg.label}`,
    seg.start.code && (seg.end?.code ? `${seg.start.code}→${seg.end.code}` : seg.start.code),
    pb.party && `party ${pb.party}`,
    pb.price && pb.price,
    pb.status !== 'confirmed' && `status: ${pb.status}`,
  ].filter(Boolean).join(' · ');

  const record: BookingRecord = {
    id: `booking-${pb.sourceEmailId}`,
    title: pb.title,
    category: CAT_FOR[pb.type],
    confirmationCode: pb.locator,
    confirmed: pb.status === 'confirmed',
    cancelable: pb.cancelable,
    linkedItemId: itemId,
    date, time,
  };

  const item = {
    id: itemId,
    title: pb.title,
    category: ITEM_CAT[pb.type],
    area: seg.start.place || seg.start.code || '',
    lat: seg.start.lat, lng: seg.start.lng,
    startTime: time,
    pinState: 'hard' as const,
    priority: 'must' as const,
    tripRole: 'anchor' as const,
    reservationBound: true as const,
    sourceType: 'email' as const,
    note: noteBits || undefined,
  } as ItineraryItem & { sourceType: 'email'; reservationBound: true };

  return { record, items: [item] };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * schema.org JSON-LD → bookings + place candidates (P1, pure, dependency-free).
 *
 * This is the high-fidelity ingestion path: most Gmail confirmations, airline/OTA pages, and
 * Google Maps embed schema.org JSON-LD. Parsing it beats NL guessing. It's the SAME module whether
 * the JSON-LD arrives from the future Chrome extension (read from the page DOM) or from the server
 * (parsed out of an email's HTML) — see output/design-ingestion-architecture-chrome-extension.md.
 *
 * Reuses the existing shapes: emits `ParsedBooking` (→ feed the merged `toArtifacts()`) and
 * `IngestedCandidate` (→ the existing Pocket suggestion + Google enrichment flow). No new geocoding:
 * lat/lng come straight from JSON-LD `geo` when present, else the existing `fetchPlaceSnapshot`
 * enriches on commit.
 */
import type { ParsedBooking, BookingType } from './parseBookingEmail';
import type { IngestedCandidate } from './extractCandidates';
import type { PlaceItem } from '../../shared/types/index';

type AnyObj = Record<string, any>;
const asArray = (x: any): any[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
const txt = (v: any): string | undefined =>
  typeof v === 'string' ? v : v?.name ?? v?.['@value'] ?? undefined;
const num = (v: any): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const typeOf = (o: AnyObj): string => String(asArray(o['@type'])[0] || '');
const pad = (n: number) => String(n).padStart(2, '0');

// ISO 8601 → our local display "YYYY-MM-DD HH:MM AM/PM" (keeps wall-clock; offset dropped for
// display, exactly like the text parser — toArtifacts re-derives a naive startISO from this).
const isoToLocal = (iso?: string): string | undefined => {
  if (!iso) return undefined;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return undefined;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[4] == null) return date;
  let h = +m[4]; const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12;
  return `${date} ${pad(hh)}:${m[5]} ${ap}`;
};

const hashId = (s: string): string => {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'bk-' + (h >>> 0).toString(36);
};
const statusOf = (o: AnyObj): ParsedBooking['status'] => {
  const s = String(o.reservationStatus || '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('hold') || s.includes('pending')) return 'pending';
  if (s.includes('chang') || s.includes('modif')) return 'changed';
  return 'confirmed';
};
const priceOf = (o: AnyObj): string | undefined => {
  const r = o.totalPrice ?? o.priceSpecification ?? o.price;
  if (r == null) return undefined;
  const amt = txt(r) ?? r?.price ?? r;
  const cur = r?.priceCurrency ?? o.priceCurrency;
  return amt != null ? `${cur ? cur + ' ' : ''}${amt}` : undefined;
};

// ── reservation → ParsedBooking ────────────────────────────────────────────────
const RESERVATION_TYPE: Record<string, BookingType> = {
  FlightReservation: 'flight', LodgingReservation: 'lodging', TrainReservation: 'rail',
  BusReservation: 'rail', FoodEstablishmentReservation: 'restaurant', RentalCarReservation: 'car',
  EventReservation: 'ticket', TaxiReservation: 'car',
};

function reservationToBooking(o: AnyObj, type: BookingType): ParsedBooking {
  const f = o.reservationFor || {};
  const locator = txt(o.reservationId) || txt(o.reservationNumber);
  const status = statusOf(o);
  let vendor = txt(f.airline) || txt(o.provider) || txt(o.broker) || txt(f.provider);
  let title = '', segStart: any = {}, segEnd: any = undefined, label: string | undefined;

  if (type === 'flight') {
    const dep = f.departureAirport || {}, arr = f.arrivalAirport || {};
    label = txt(f.flightNumber) || [txt(f.airline), f.flightNumber].filter(Boolean).join(' ') || undefined;
    segStart = { dateTimeLocal: isoToLocal(f.departureTime), code: txt(dep.iataCode), place: txt(dep) };
    segEnd = { dateTimeLocal: isoToLocal(f.arrivalTime), code: txt(arr.iataCode), place: txt(arr) };
    title = `${vendor || 'Flight'} ${label || ''}`.trim();
  } else if (type === 'rail') {
    const dep = f.departureStation || {}, arr = f.arrivalStation || {};
    label = txt(f.trainNumber) || txt(f.trainName);
    segStart = { dateTimeLocal: isoToLocal(f.departureTime), place: txt(dep) };
    segEnd = { dateTimeLocal: isoToLocal(f.arrivalTime), place: txt(arr) };
    title = txt(f) || `${vendor || 'Train'} ${label || ''}`.trim() || 'Train';
  } else if (type === 'lodging') {
    segStart = { dateTimeLocal: isoToLocal(o.checkinTime), place: txt(f), lat: num(f.geo?.latitude), lng: num(f.geo?.longitude) };
    segEnd = { dateTimeLocal: isoToLocal(o.checkoutTime) };
    vendor = vendor || txt(f);
    title = txt(f) || 'Lodging';
  } else if (type === 'restaurant') {
    segStart = { dateTimeLocal: isoToLocal(o.startTime || f.startDate), place: txt(f), lat: num(f.geo?.latitude), lng: num(f.geo?.longitude) };
    title = txt(f) || 'Restaurant reservation';
  } else if (type === 'car') {
    const pick = f.pickupLocation || {};
    segStart = { dateTimeLocal: isoToLocal(o.pickupTime || f.pickupTime), place: txt(pick) };
    segEnd = { dateTimeLocal: isoToLocal(o.dropoffTime || f.dropoffTime), place: txt(f.dropoffLocation) };
    title = `${vendor || 'Car rental'}`.trim();
  } else { // ticket / event
    const loc = f.location || {};
    segStart = { dateTimeLocal: isoToLocal(f.startDate || o.startTime), place: txt(loc), lat: num(loc.geo?.latitude), lng: num(loc.geo?.longitude) };
    title = txt(f) || 'Event ticket';
  }

  const party = num(o.partySize) ?? num(o.numSeats) ?? (o.underName ? undefined : undefined);
  return {
    type, vendor, locator, status,
    segments: [{ start: segStart, end: segEnd?.dateTimeLocal || segEnd?.place || segEnd?.code ? segEnd : undefined, label }],
    party, price: priceOf(o),
    title, confidence: 0.97,
    sourceEmailId: hashId(`jsonld|${type}|${locator || ''}|${segStart.dateTimeLocal || ''}`),
    raw: typeof o === 'object' ? undefined : String(o),
  };
}

// ── place node → IngestedCandidate ─────────────────────────────────────────────
const PLACE_FOOD = /Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|Winery|Brewery/i;
const PLACE_STAY = /LodgingBusiness|Hotel|Hostel|Resort|BedAndBreakfast/i;
const PLACE_SIGHT = /TouristAttraction|Museum|Park|LandmarksOrHistoricalBuildings|PlaceOfWorship|Place|LocalBusiness|Landform/i;

function isPlaceType(t: string): boolean {
  return PLACE_FOOD.test(t) || PLACE_STAY.test(t) || PLACE_SIGHT.test(t);
}
function placeToCandidate(o: AnyObj, t: string, areaHint: string): IngestedCandidate | null {
  const name = txt(o.name) || txt(o.legalName);
  if (!name) return null;
  const category: PlaceItem['category'] = PLACE_FOOD.test(t) ? 'food' : PLACE_STAY.test(t) ? 'stay' : 'sight';
  const addr = o.address || {};
  const area = txt(addr.addressLocality) || txt(addr.addressRegion) || txt(addr) || '';
  const hours = typeof o.openingHours === 'string' ? o.openingHours
    : Array.isArray(o.openingHours) ? o.openingHours.join('; ') : undefined;
  const tags: string[] = [];
  if (o.servesCuisine) asArray(o.servesCuisine).forEach((c: any) => { const v = txt(c); if (v) tags.push(v.toLowerCase()); });
  return {
    id: `ingest-jsonld-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    title: name,
    category,
    area,
    lat: num(o.geo?.latitude),
    lng: num(o.geo?.longitude),
    openingHours: hours,
    sourceType: 'manual',
    tags,
    priority: 'medium',
    website: txt(o.url),
    rating: num(o.aggregateRating?.ratingValue),
    formattedAddress: txt(addr) || undefined,
    // Pocket clustering field (Agent 5 / PR #10): same convention as extractCandidates —
    // group by the per-capture area/day hint, falling back to the place's own locality.
    ...((areaHint || area) ? { group: areaHint || area } : {}),
    signals: { verdict: 'recommended', confidence: 0.9, evidence: 'schema.org JSON-LD' },
  } as IngestedCandidate;
}

export interface JsonLdResult { bookings: ParsedBooking[]; candidates: IngestedCandidate[]; }

/** Parse an array of schema.org JSON-LD nodes (already JSON-parsed) into bookings + candidates. */
export function parseJsonLd(nodes: unknown[], areaHint = ''): JsonLdResult {
  const flat: AnyObj[] = [];
  for (const n of asArray(nodes)) {
    if (!n || typeof n !== 'object') continue;
    const g = (n as AnyObj)['@graph'];
    if (Array.isArray(g)) flat.push(...g); else flat.push(n as AnyObj);
  }
  const bookings: ParsedBooking[] = [];
  const candidates: IngestedCandidate[] = [];
  const seen = new Set<string>();
  for (const o of flat) {
    const t = typeOf(o);
    const resType = RESERVATION_TYPE[t];
    if (resType) {
      const b = reservationToBooking(o, resType);
      if (!seen.has(b.sourceEmailId)) { seen.add(b.sourceEmailId); bookings.push(b); }
    } else if (isPlaceType(t)) {
      const c = placeToCandidate(o, t, areaHint);
      if (c && !seen.has(c.id)) { seen.add(c.id); candidates.push(c); }
    }
  }
  return { bookings, candidates };
}

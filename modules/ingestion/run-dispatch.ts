/**
 * Harness for the unified ingestion front door.
 * Run: node_modules/.bin/tsx modules/ingestion/run-dispatch.ts
 *
 * Shows one dispatchIngestion() routing every surface: JSON-LD (extension/Gmail), booking text,
 * and a blog — all into the same IngestionResult, then adapted to the existing Pocket suggestion.
 */
import { dispatchIngestion, toSuggestion, type IngestionRequest } from './dispatchIngestion';

const line = (s = '') => console.log(s);
const H = (s: string) => line(`\n══ ${s} ══`);

// 1) schema.org JSON-LD as a Chrome extension would harvest from a Gmail confirmation + a Maps page
const jsonld = [
  {
    '@context': 'https://schema.org', '@type': 'FlightReservation',
    reservationId: '5XKP2Q', reservationStatus: 'https://schema.org/ReservationConfirmed',
    reservationFor: {
      '@type': 'Flight', flightNumber: 'NH106', airline: { '@type': 'Airline', name: 'ANA' },
      departureAirport: { '@type': 'Airport', iataCode: 'HND' }, arrivalAirport: { '@type': 'Airport', iataCode: 'ITM' },
      departureTime: '2026-04-15T09:30:00+09:00', arrivalTime: '2026-04-15T10:45:00+09:00',
    },
  },
  {
    '@context': 'https://schema.org', '@type': 'Restaurant', name: 'Gyoza Hohei',
    address: { '@type': 'PostalAddress', addressLocality: 'Gion' },
    geo: { '@type': 'GeoCoordinates', latitude: 35.0036, longitude: 135.7745 },
    servesCuisine: ['Gyoza'], openingHours: 'Mo-Su 17:00-23:00', aggregateRating: { ratingValue: 4.6 },
  },
];

H('1) JSON-LD (extension / Gmail / Maps)');
const r1 = dispatchIngestion({ surface: 'extension', content: 'jsonld', jsonld, url: 'https://mail.google.com' });
report(r1);

// 2) pasted booking text → routed to the booking parser
H('2) Pasted booking text (copilot)');
const r2 = dispatchIngestion({
  surface: 'copilot-paste',
  rawText: 'Booking.com — confirmed! Confirmation number: 8842019. Ace Hotel Kyoto. Check-in: 15 Apr 2026, 3:00 PM. Check-out: 18 Apr 2026. Free cancellation.',
});
report(r2);

// 3) blog text → routed to extractCandidates (Pocket candidates)
H('3) Blog text (copilot)');
const r3 = dispatchIngestion({
  surface: 'copilot-paste', areaHint: 'Kyoto',
  rawText: "Nishiki Market is a must for lunch, open 9 AM - 6 PM. Don't miss Kiyomizu-dera at sunrise.",
});
report(r3);

function report(r: ReturnType<typeof dispatchIngestion>) {
  line(`  bookings=${r.bookings.length} candidates=${r.candidates.length} warnings=[${r.warnings.join('; ')}]`);
  for (const b of r.bookings) line(`   📌 ${b.record.category} "${b.record.title}" status=${b.record.status} from=${b.record.from ?? '—'} to=${b.record.to ?? '—'} startISO=${b.record.startISO ?? '—'} → anchor reservationBound=${b.items[0].reservationBound}`);
  for (const c of r.candidates) line(`   📍 ${c.category} "${c.title}" area=${c.area || '—'} group=${(c as any).group ?? '—'} lat=${c.lat ?? '—'} hours=${c.openingHours ?? '—'}`);
  const sug = toSuggestion(r);
  line(`  → message: ${sug.message}`);
  line(`  → suggestion.itemsToAdd = ${sug.suggestion?.itemsToAdd?.length ?? 0} (feeds existing handleApplySug + fetchPlaceSnapshot)`);
}

line('\nDONE');

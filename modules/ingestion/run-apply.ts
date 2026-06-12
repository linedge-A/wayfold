/**
 * Harness for the booking apply path.
 * Run: node_modules/.bin/tsx modules/ingestion/run-apply.ts
 *
 * Full flow: dispatchIngestion (parse) → applyBookings (commit onto trip state) → a cancellation
 * re-import (unlock + re-plan). Proves the end-to-end "forward a confirmation, it lands in the trip".
 */
import { dispatchIngestion } from './dispatchIngestion';
import { applyBookings, type BookingApplyState } from './applyBookings';

const line = (s = '') => console.log(s);
const H = (s: string) => line(`\n══ ${s} ══`);

// a 4-day Kyoto trip starting 2026-04-15
const state0: BookingApplyState = {
  bookings: [],
  itineraryItems: [],
  days: [{ id: 'day-1' }, { id: 'day-2' }, { id: 'day-3' }, { id: 'day-4' }],
  tripStartDate: '2026-04-15',
};

// 1) parse a flight (Apr 15) + a restaurant reservation (Apr 16)
const flightJsonLd = [{
  '@type': 'FlightReservation', reservationId: '5XKP2Q', reservationStatus: 'https://schema.org/ReservationConfirmed',
  reservationFor: { '@type': 'Flight', flightNumber: 'NH106', airline: { name: 'ANA' },
    departureAirport: { iataCode: 'HND' }, arrivalAirport: { iataCode: 'ITM' },
    departureTime: '2026-04-15T09:30:00+09:00', arrivalTime: '2026-04-15T10:45:00+09:00' },
}];
const parsedFlight = dispatchIngestion({ surface: 'extension', content: 'jsonld', jsonld: flightJsonLd });
const parsedDinner = dispatchIngestion({ surface: 'copilot-paste', rawText:
  'Reservation confirmed at Shigetsu. Confirmation: TENRYU552. Table for 2 on 2026-04-16 at 12:30 PM.' });

H('1) Apply a flight + a restaurant');
const r1 = applyBookings(state0, [...parsedFlight.bookings, ...parsedDinner.bookings]);
r1.notes.forEach(n => line('  • ' + n));
line('  bookings: ' + r1.bookings.map(b => `${b.title}[${b.status}]`).join(', '));
line('  scheduled anchors:');
r1.itineraryItems.forEach(it => line(`    ${it.dayId}  ${it.startTime ?? ''}  ${it.title}  (reservationBound=${(it as any).reservationBound})`));
line('  deltas: ' + r1.deltas.map(d => `${d.type}:${d.itemTitle}`).join(', ') + `  · planRevised=${r1.planRevised}`);

// 2) airline sends a CANCELLATION for the same flight (same sourceEmailId) → unlock + re-plan
H('2) Cancellation re-import (same booking) → unlock + PLAN_REVISED');
const cancelled = parsedFlight.bookings.map(b => ({ ...b, record: { ...b.record, status: 'cancelled' as const } }));
const state1: BookingApplyState = { ...state0, bookings: r1.bookings, itineraryItems: r1.itineraryItems };
const r2 = applyBookings(state1, cancelled);
r2.notes.forEach(n => line('  • ' + n));
line('  remaining anchors: ' + (r2.itineraryItems.map(i => i.title).join(', ') || '(none)'));
line('  flight record now: ' + r2.bookings.find(b => b.title.includes('NH106'))?.status);
line(`  planRevised=${r2.planRevised}  → emit PLAN_REVISED so the optimizer fills the freed slot`);

// 3) idempotency: re-applying the same confirmed flight must NOT duplicate
H('3) Idempotency — re-import the same confirmation');
const r3 = applyBookings({ ...state0, bookings: r1.bookings, itineraryItems: r1.itineraryItems }, parsedFlight.bookings);
const flights = r3.bookings.filter(b => b.title.includes('NH106')).length;
const flightAnchors = r3.itineraryItems.filter(i => i.title.includes('NH106')).length;
line(`  flight records=${flights} (expect 1)  ·  flight anchors=${flightAnchors} (expect 1)  → ${flights === 1 && flightAnchors === 1 ? 'idempotent ✓' : 'DUPLICATE ✗'}`);

line('\nDONE');

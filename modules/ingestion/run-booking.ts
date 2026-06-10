/**
 * Harness for the P0 booking-email parser.
 * Run: node_modules/.bin/tsx modules/ingestion/run-booking.ts
 */
import { parseBookingEmail, toArtifacts, looksLikeBooking } from './parseBookingEmail';

const line = (s = '') => console.log(s);
const H = (s: string) => line(`\n══ ${s} ══`);

const samples: { name: string; text: string }[] = [
  {
    name: 'Flight (ANA)',
    text: `ANA — Your e-ticket is confirmed.
Booking reference: 5XKP2Q
Flight NH106 from HND to ITM on April 15, 2026, departure 09:30 AM.
Seat 32A. Fare ¥18,400. This fare is non-refundable.`,
  },
  {
    name: 'Hotel (Booking.com)',
    text: `Booking.com — Your reservation is confirmed!
Confirmation number: 8842019
Ace Hotel Kyoto. Check-in: 15 Apr 2026, 3:00 PM. Check-out: 18 Apr 2026.
Free cancellation until April 13. Total €612.`,
  },
  {
    name: 'Restaurant',
    text: `Reservation confirmed at Shigetsu.
Confirmation: TENRYU552. Table for 2 on 2026-04-16 at 12:30 PM. Non-refundable deposit.`,
  },
  {
    name: 'ICS attachment',
    text: `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:eurostar-9043@booking
SUMMARY:Eurostar train London to Paris
DTSTART:20260420T081500
DTEND:20260420T113500
LOCATION:St Pancras International
DESCRIPTION:Coach 5 Seat 41. Booking ref EUS9043.
END:VEVENT
END:VCALENDAR`,
  },
  { name: 'Not a booking (blog)', text: `A perfect day in Kyoto — Nishiki Market is a must for lunch, open 9 AM - 6 PM.` },
];

for (const s of samples) {
  H(s.name);
  line(`  looksLikeBooking = ${looksLikeBooking(s.text)}`);
  const parsed = parseBookingEmail(s.text);
  if (!parsed.length) { line('  → no booking parsed'); continue; }
  for (const pb of parsed) {
    const seg = pb.segments[0];
    line(`  type=${pb.type} vendor=${pb.vendor ?? '—'} locator=${pb.locator ?? '—'} conf=${pb.confidence.toFixed(2)}`);
    line(`    when=${seg.start.dateTimeLocal ?? '—'} where=${seg.start.place ?? seg.start.code ?? '—'}${seg.end?.code ? '→' + seg.end.code : ''} label=${seg.label ?? '—'} cancelable=${pb.cancelable ?? '—'}`);
    const { record, items } = toArtifacts(pb);
    line(`    BookingRecord: ${record.category} "${record.title}" code=${record.confirmationCode ?? '—'} confirmed=${record.confirmed} date=${record.date ?? '—'} time=${record.time ?? '—'} →linkedItemId=${record.linkedItemId}`);
    const it = items[0];
    line(`    Anchor item:   ${it.category} "${it.title}" reservationBound=${it.reservationBound} pin=${it.pinState} start=${it.startTime ?? '—'} note="${it.note ?? ''}"`);
  }
}

line('\nDONE');

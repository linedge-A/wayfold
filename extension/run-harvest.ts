/**
 * Harness — proves the extension → core path WITHOUT a browser.
 * Run: node_modules/.bin/tsx extension/run-harvest.ts
 *
 * Sample page HTML (a Gmail confirmation + a Maps place, both with schema.org JSON-LD) →
 * harvest → buildIngestionRequest → the SAME dispatchIngestion the copilot/server use → result.
 */
import { extractJsonLdFromHtml, buildIngestionRequest } from './lib/harvest';
import { dispatchIngestion, type IngestionRequest } from '../modules/ingestion/dispatchIngestion';

const line = (s = '') => console.log(s);

// a page as the content script would see it: embedded JSON-LD for a flight + a restaurant
const pageHtml = `<!doctype html><html><head><title>Your trip — Gmail</title>
<meta property="og:title" content="ANA e-ticket"/>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"FlightReservation","reservationId":"5XKP2Q",
  "reservationStatus":"https://schema.org/ReservationConfirmed",
  "reservationFor":{"@type":"Flight","flightNumber":"NH106","airline":{"name":"ANA"},
    "departureAirport":{"iataCode":"HND"},"arrivalAirport":{"iataCode":"ITM"},
    "departureTime":"2026-04-15T09:30:00+09:00","arrivalTime":"2026-04-15T10:45:00+09:00"}}
</script>
<script type="application/ld+json">
{ "@context":"https://schema.org","@type":"Restaurant","name":"Gyoza Hohei",
  "address":{"addressLocality":"Gion"},"geo":{"latitude":35.0036,"longitude":135.7745},
  "servesCuisine":["Gyoza"],"openingHours":"Mo-Su 17:00-23:00","aggregateRating":{"ratingValue":4.6}}
</script></head><body>...</body></html>`;

line('══ 1) Harvest JSON-LD from the page ══');
const nodes = extractJsonLdFromHtml(pageHtml);
line(`  extracted ${nodes.length} JSON-LD node(s): ${nodes.map((n: any) => n['@type']).join(', ')}`);

line('\n══ 2) Build the IngestionRequest the extension POSTs to /api/ingest ══');
const req = buildIngestionRequest({ url: 'https://mail.google.com/mail/u/0/#inbox/abc', html: pageHtml });
line(`  surface=${req.surface} content=${req.content} jsonld=${req.jsonld?.length ?? 0} pageTitle="${req.pageTitle}"`);

line('\n══ 3) Server runs the SHARED core (dispatchIngestion) — no parser fork ══');
const result = dispatchIngestion(req as IngestionRequest);
line(`  bookings=${result.bookings.length} candidates=${result.candidates.length}`);
for (const b of result.bookings) line(`   📌 ${b.record.category} "${b.record.title}" status=${b.record.status} from=${b.record.from ?? '—'} to=${b.record.to ?? '—'} startISO=${b.record.startISO ?? '—'}`);
for (const c of result.candidates) line(`   📍 ${c.category} "${c.title}" group=${(c as any).group ?? '—'} lat=${c.lat ?? '—'} hours=${c.openingHours ?? '—'}`);

line('\n══ 4) Plain-text selection (no JSON-LD) still routes to the core ══');
const r2 = dispatchIngestion(buildIngestionRequest({
  url: 'https://someblog.com/kyoto', selection: 'Nishiki Market is a must for lunch, open 9 AM - 6 PM.',
}) as IngestionRequest);
line(`  bookings=${r2.bookings.length} candidates=${r2.candidates.length} → ${r2.candidates.map(c => c.title).join(', ')}`);

line('\nDONE');

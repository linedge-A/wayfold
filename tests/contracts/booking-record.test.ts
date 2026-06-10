/**
 * Contract / QA guard (Agent 9) — BookingRecord extension (PR #5 proposal).
 *
 * Locks in the decisions made on the ingestion contract proposal:
 *  - existing seed bookings stay valid (additions are optional → zero breakage)
 *  - `confirmed` is kept; when `status` is set, confirmed === (status === 'confirmed')
 *  - `linkedItemId` kept; when both set, linkedItemId === linkedItemIds[0]
 *  - the new optional fields are accepted by the type (compile-checked by tsc)
 *
 * Run: node_modules/.bin/tsx tests/contracts/booking-record.test.ts
 */
import assert from 'node:assert/strict';
import type { BookingRecord } from '../../shared/types/index';
import { INITIAL_BOOKINGS } from '../../shared/mock-data/seedData';

let passed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, '\n      ', (e as Error).message);
    process.exitCode = 1;
  }
};

const CATEGORIES = ['hotel', 'restaurant', 'ticket', 'transport'];
const STATUSES = ['confirmed', 'cancelled', 'changed', 'pending'];

const invariants = (b: BookingRecord) => {
  if (b.status) assert.ok(STATUSES.includes(b.status), `${b.id}: bad status ${b.status}`);
  if (b.status !== undefined) {
    assert.equal(b.confirmed, b.status === 'confirmed', `${b.id}: confirmed must equal (status==='confirmed')`);
  }
  if (b.linkedItemId && b.linkedItemIds) {
    assert.equal(b.linkedItemId, b.linkedItemIds[0], `${b.id}: linkedItemId must equal linkedItemIds[0]`);
  }
};

console.log('BookingRecord contract');

// 1) Back-compat: existing seed bookings still satisfy the required shape.
check('seed INITIAL_BOOKINGS conform to required fields', () => {
  assert.ok(INITIAL_BOOKINGS.length > 0, 'no seed bookings');
  for (const b of INITIAL_BOOKINGS) {
    assert.equal(typeof b.id, 'string');
    assert.equal(typeof b.title, 'string');
    assert.ok(CATEGORIES.includes(b.category), `${b.id}: bad category ${b.category}`);
    assert.equal(typeof b.confirmed, 'boolean', `${b.id}: confirmed must stay boolean`);
  }
});

// 2) New optional fields are accepted by the type (tsc) and carry their invariants (runtime).
const samples: BookingRecord[] = [
  {
    id: 'bk-nh106', title: 'ANA NH106 HND→ITM', category: 'transport',
    confirmed: true, status: 'confirmed', vendor: 'ANA', confirmationCode: 'ABC123',
    from: 'HND', to: 'ITM', seatOrRoom: '32A', party: 2, price: '¥18,400',
    startISO: '2026-04-12T09:00:00+09:00', endISO: '2026-04-12T10:10:00+09:00', timezone: 'Asia/Tokyo',
    linkedItemId: 'place-flight-1', linkedItemIds: ['place-flight-1'], sourceEmailId: 'h:nh106:hnd-itm'
  },
  { id: 'bk-hotel-x', title: 'Ace Hotel (cancelled)', category: 'hotel', confirmed: false, status: 'cancelled', vendor: 'Booking.com', linkedItemIds: ['place-ace'] },
  { id: 'bk-legacy', title: 'Legacy seat', category: 'restaurant', confirmed: true, linkedItemId: 'place-x' }
];

check('extended sample bookings satisfy the invariants', () => {
  for (const b of samples) invariants(b);
});

check('seed bookings satisfy the invariants too', () => {
  for (const b of INITIAL_BOOKINGS) invariants(b);
});

console.log(process.exitCode ? '\nFAILED' : `\nOK — ${passed} checks passed`);

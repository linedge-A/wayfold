/**
 * Contract / QA guard (Agent 9) — Iceland family example trip.
 *
 * Validates the additive seeded trip is internally consistent and matches the
 * shared/types contracts, so it can be loaded as a working example without
 * runtime surprises (orphan day refs, broken booking links, bad coords, etc).
 *
 * Pure data check — run: node_modules/.bin/tsx tests/contracts/iceland-trip.test.ts
 */
import assert from 'node:assert/strict';
import {
  ICELAND_FAMILY_TRIP_BRIEF as BRIEF,
  ICELAND_FAMILY_DAYS as DAYS,
  ICELAND_FAMILY_ITINERARY_ITEMS as ITEMS,
  ICELAND_FAMILY_POCKET as POCKET,
  ICELAND_FAMILY_BOOKINGS as BOOKINGS,
  ICELAND_FAMILY_ARCHIVE_ITEM as ARCHIVE
} from '../../shared/mock-data/icelandFamilyTrip';

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

const STYLES = ['relaxing', 'balanced', 'intense', 'luxury', 'budget'];
const TRANSPORTS = ['walk', 'transit', 'drive', 'mixed'];
const CATEGORIES = ['sight', 'food', 'stay', 'transit', 'backup', 'booking'];
const PINS = ['none', 'soft', 'hard'];
const PRIORITIES = ['low', 'medium', 'high', 'must'];

const parseT = (s?: string): number | null => {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
};

console.log('Iceland family trip contract');

// 1) Brief
check('brief has valid style + transport + ordered dates', () => {
  assert.ok(STYLES.includes(BRIEF.style), `bad style ${BRIEF.style}`);
  assert.ok(TRANSPORTS.includes(BRIEF.transport), `bad transport ${BRIEF.transport}`);
  assert.ok(BRIEF.startDate < BRIEF.endDate, 'startDate must precede endDate');
});

// 2) Days
check('days have unique ids', () => {
  const ids = DAYS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate day id');
});

// 3) Items
const dayIds = new Set(DAYS.map((d) => d.id));
const itemIds = new Set<string>();
check('every item: unique id, valid enums, resolvable dayId', () => {
  for (const it of ITEMS) {
    assert.ok(!itemIds.has(it.id), `duplicate item id ${it.id}`);
    itemIds.add(it.id);
    assert.ok(dayIds.has(it.dayId), `item ${it.id} references missing day ${it.dayId}`);
    assert.ok(CATEGORIES.includes(it.category), `item ${it.id} bad category ${it.category}`);
    assert.ok(PINS.includes(it.pinState), `item ${it.id} bad pinState ${it.pinState}`);
    assert.ok(PRIORITIES.includes(it.priority), `item ${it.id} bad priority ${it.priority}`);
  }
});
check('every item start time precedes end time', () => {
  for (const it of ITEMS) {
    const s = parseT(it.startTime);
    const e = parseT(it.endTime);
    if (s != null && e != null) assert.ok(s < e, `item ${it.id} start ${it.startTime} !< end ${it.endTime}`);
  }
});
check('every item lat/lng is within Iceland bounds', () => {
  for (const it of ITEMS) {
    if (it.lat == null || it.lng == null) continue;
    assert.ok(it.lat >= 63 && it.lat <= 67, `item ${it.id} lat ${it.lat} out of Iceland range`);
    assert.ok(it.lng >= -25 && it.lng <= -13, `item ${it.id} lng ${it.lng} out of Iceland range`);
  }
});
check('every day has at least one item', () => {
  for (const d of DAYS) {
    assert.ok(ITEMS.some((it) => it.dayId === d.id), `day ${d.id} has no items`);
  }
});

// 4) Bookings link to real items
check('every booking linkedItemId resolves to an item', () => {
  for (const b of BOOKINGS) {
    if (b.linkedItemId) assert.ok(itemIds.has(b.linkedItemId), `booking ${b.id} links missing item ${b.linkedItemId}`);
  }
});

// 5) Pocket
check('pocket items have unique ids + valid categories', () => {
  const pids = new Set<string>();
  for (const col of POCKET) {
    for (const p of col.items) {
      assert.ok(!pids.has(p.id), `duplicate pocket id ${p.id}`);
      pids.add(p.id);
      assert.ok(CATEGORIES.includes(p.category), `pocket ${p.id} bad category ${p.category}`);
    }
  }
});

// 6) Archive card stays in sync with the trip
check('archive item matches the trip (id + stopCount)', () => {
  assert.equal(ARCHIVE.id, BRIEF.id, 'archive id must match brief id');
  assert.equal(ARCHIVE.stopCount, ITEMS.length, 'archive stopCount must equal item count');
});

console.log(process.exitCode ? '\nFAILED' : `\nOK — ${passed} checks passed (${ITEMS.length} items across ${DAYS.length} days)`);

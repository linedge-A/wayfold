/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * applyBookings — the commit step for parsed bookings (pure, dependency-free).
 *
 * dispatchIngestion() turns a forwarded/pasted confirmation into `{ record: BookingRecord,
 * items: ItineraryItem[] }`. This reducer folds those into the trip state: it upserts the
 * BookingRecord (idempotent by `sourceEmailId`), resolves each locked anchor onto the right day,
 * and reconciles cancellations (status:'cancelled' → unlock the linked anchors and signal a
 * re-plan). It is a pure function of state → next state, so the App (Agent 0) and the
 * booking-records store (Agent 8) just call it and setState — no logic lives in the UI.
 *
 * Uses the contract fields added in #7: `status`, `linkedItemIds`, `sourceEmailId`, `startISO`.
 */
import type { BookingRecord, ItineraryItem, RevisionDelta, TripBrief } from '../../shared/types/index';

export interface BookingApplyState {
  bookings: BookingRecord[];
  itineraryItems: ItineraryItem[];
  days: { id: string }[];        // ordered day list (index 0 = trip start day)
  tripStartDate?: TripBrief['startDate'];
}
export interface BookingArtifact { record: BookingRecord; items: ItineraryItem[]; }
export interface BookingApplyResult {
  bookings: BookingRecord[];
  itineraryItems: ItineraryItem[];
  deltas: RevisionDelta[];
  planRevised: boolean;          // true when an anchor was unlocked (cancel/change) → emit PLAN_REVISED
  notes: string[];
}

const uid = () => `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const dayOf = (d?: string) => (d ? String(d).slice(0, 10) : undefined);

/** Map a booking's calendar date onto a dayId by offset from the trip start. null if outside the trip. */
function resolveDayId(dateISO: string | undefined, tripStartDate: string | undefined, days: { id: string }[]): string | null {
  const a = dayOf(dateISO), b = dayOf(tripStartDate);
  if (!a || !b || !days.length) return null;
  const t0 = Date.parse(b), t1 = Date.parse(a);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const idx = Math.round((t1 - t0) / 86_400_000);
  return days[idx]?.id ?? null;
}

const linkedIdsOf = (r: BookingRecord, anchors: ItineraryItem[]): string[] =>
  (r.linkedItemIds && r.linkedItemIds.length ? r.linkedItemIds
    : r.linkedItemId ? [r.linkedItemId]
    : anchors.map(a => a.id));

/**
 * Fold parsed bookings into trip state. Pure: returns the next bookings/items + the deltas to
 * surface and whether a re-plan should fire. Never mutates inputs.
 */
export function applyBookings(state: BookingApplyState, incoming: BookingArtifact[]): BookingApplyResult {
  const bookings = [...state.bookings];
  let items = [...state.itineraryItems];
  const deltas: RevisionDelta[] = [];
  const notes: string[] = [];
  let planRevised = false;

  const upsertRecord = (r: BookingRecord): number => {
    const i = r.sourceEmailId ? bookings.findIndex(x => x.sourceEmailId && x.sourceEmailId === r.sourceEmailId) : -1;
    if (i >= 0) { bookings[i] = { ...bookings[i], ...r }; return i; }
    bookings.push(r); return -1;
  };

  for (const { record, items: anchors } of incoming) {
    const linked = linkedIdsOf(record, anchors);

    // ── cancellation / removal: unlock the linked anchors, keep the record (marked) → re-plan ──
    if (record.status === 'cancelled') {
      const before = items.length;
      items = items.filter(it => !linked.includes(it.id));
      const removed = before - items.length;
      upsertRecord(record);
      if (removed > 0) {
        planRevised = true;
        deltas.push({ id: uid(), type: 'drop', itemTitle: record.title, note: 'Booking cancelled — freed the slot for re-planning.' });
        notes.push(`cancelled: ${record.title} (unlocked ${removed} anchor${removed === 1 ? '' : 's'})`);
      } else {
        notes.push(`cancelled: ${record.title} (no scheduled anchor to free)`);
      }
      continue;
    }

    // ── confirmed / changed / pending: upsert the record + place the locked anchors on their day ──
    const existed = upsertRecord(record) >= 0;
    const dayId = resolveDayId(record.startISO || record.date, state.tripStartDate, state.days);

    if (!dayId) {
      // keep the wallet record, but don't orphan an anchor on no day
      notes.push(`${existed ? 'updated' : 'added'}: ${record.title} — date ${dayOf(record.startISO || record.date) ?? '?'} outside trip; saved to bookings, not scheduled`);
      deltas.push({ id: uid(), type: existed ? 'confirm' : 'add', itemTitle: record.title, note: 'Saved to bookings (outside trip dates).' });
      continue;
    }

    let changed = false;
    for (const a of anchors) {
      const anchor: ItineraryItem = { ...a, dayId };
      const i = items.findIndex(it => it.id === anchor.id);
      if (i >= 0) { if (items[i].dayId !== dayId || items[i].startTime !== anchor.startTime) { planRevised = true; } items[i] = { ...items[i], ...anchor }; }
      else items.push(anchor);
      changed = true;
    }
    if (changed) {
      deltas.push({ id: uid(), type: existed ? 'confirm' : 'add', itemTitle: record.title, to: record.time, note: `Locked into ${dayId}.` });
      notes.push(`${existed ? 'updated' : 'added'}: ${record.title} → ${dayId}`);
    }
  }

  return { bookings, itineraryItems: items, deltas, planRevised, notes };
}

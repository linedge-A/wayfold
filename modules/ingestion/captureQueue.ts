/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * captureQueue — a lightweight per-account inbox of pending captures (pure store).
 *
 * The web app holds trip state client-side (no server trip store), so the Chrome extension can't
 * commit directly. Instead /api/ingest/commit ENQUEUES a capture here, keyed by account; the web app
 * drains it on load/focus (GET /api/ingest/pending) and applies it through the EXISTING paths —
 * candidates → the Pocket suggestion flow, bookings → applyBookings (#17). This module is just the
 * queue; it does no parsing or applying.
 *
 * Scaffold-grade: in-memory (lost on server restart), so a durable store (or per-account row) is a
 * later swap behind this same interface.
 */
export interface PendingCapture {
  id: string;
  capturedAt: number;
  bookings?: unknown[];   // BookingArtifact[] from /api/ingest (record + reservationBound items)
  candidates?: unknown[]; // PlaceItem[]
  source?: { surface?: string; url?: string };
}

const store = new Map<string, PendingCapture[]>();
const uid = () => `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Add a capture to an account's inbox. Returns the stored record (with id + timestamp). */
export function enqueue(account: string, capture: Omit<PendingCapture, 'id' | 'capturedAt'>): PendingCapture {
  const rec: PendingCapture = { id: uid(), capturedAt: Date.now(), ...capture };
  const list = store.get(account) ?? [];
  list.push(rec);
  store.set(account, list);
  return rec;
}

/** Non-destructive read of an account's pending captures (the app applies, then acks). */
export function listPending(account: string): PendingCapture[] {
  return [...(store.get(account) ?? [])];
}

/** Remove captures the app has applied. Returns how many were cleared. */
export function ack(account: string, ids: string[]): number {
  const set = new Set(ids);
  const list = store.get(account) ?? [];
  const next = list.filter(c => !set.has(c.id));
  if (next.length) store.set(account, next); else store.delete(account);
  return list.length - next.length;
}

/** Test helper — clear all state. */
export function _reset(): void {
  store.clear();
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TripBrief {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  flexibleDates: boolean;
  style: 'relaxing' | 'balanced' | 'intense' | 'luxury' | 'budget';
  transport: 'walk' | 'transit' | 'drive' | 'mixed';
  notes?: string;
  image?: string;
}

export interface PlaceItem {
  id: string;
  title: string;
  category: 'sight' | 'food' | 'stay' | 'transit' | 'backup' | 'booking';
  area: string;
  lat?: number; // Normalized lat value relative to map container for premium custom render
  lng?: number; // Normalized lng value
  estimatedDurationMin?: number;
  sourceType?: 'blog' | 'email' | 'article' | 'manual' | 'ai' | 'tiktok';
  tripRole?: 'anchor' | 'supporting' | 'optional';
  reservationBound?: boolean;
  tags?: string[];
  group?: string; // organizing cluster for the Research Pocket (area / day label, set at ingestion); used to group the pocket and surface day-relevant POIs while planning
  subCategory?: string;
  budget?: string;
  openingHours?: string;
  imageUrl?: string;
  // Live Google Places metadata loaded upon ingestion
  rating?: number;
  userRatingCount?: number;
  phoneNumber?: string;
  website?: string;
  reservable?: boolean;
  editorialSummary?: string;
  formattedAddress?: string;
  googlePlaceFieldsLoaded?: boolean;
}

export interface ItineraryItem extends PlaceItem {
  dayId: string; // references day id such as "day-1"
  startTime?: string; // e.g. "09:00 AM"
  endTime?: string;
  pinState: 'none' | 'soft' | 'hard';
  priority: 'low' | 'medium' | 'high' | 'must';
  status?: 'scheduled' | 'missed' | 'makeup' | 'done';
  transitFromPrevMin?: number;
  note?: string;
}

export interface PocketColumn {
  id: string;
  title: string;
  items: PlaceItem[];
}

export interface BookingRecord {
  id: string;
  title: string;
  category: 'hotel' | 'restaurant' | 'ticket' | 'transport';
  confirmationCode?: string;
  /**
   * Canonical binary confirmation flag — retained as-is for existing consumers.
   * When `status` is also present, the invariant is `confirmed === (status === 'confirmed')`.
   */
  confirmed: boolean;
  cancelable?: boolean;
  /** @deprecated Prefer `linkedItemIds`. Kept for back-compat; equals `linkedItemIds[0]` when both are set. */
  linkedItemId?: string;
  date?: string;
  time?: string;

  // ── Extended fields for parsed bookings (ingestion, PR #5). All optional & additive. ──
  /** Richer lifecycle state. A 'cancelled'/'changed' booking should drive a PLAN_REVISED re-plan. */
  status?: 'confirmed' | 'cancelled' | 'changed' | 'pending';
  /** Provider / brand, e.g. "ANA", "Booking.com". */
  vendor?: string;
  /** One booking may anchor several itinerary blocks (multi-leg flight, multi-night stay). */
  linkedItemIds?: string[];
  /** ISO 8601 incl. offset — lossless for red-eyes, timezones, and multi-day stays. */
  startISO?: string;
  /** ISO 8601 incl. offset (checkout / flight arrival / rail arrival). */
  endISO?: string;
  /** IANA timezone, e.g. "Asia/Tokyo". */
  timezone?: string;
  /** Transport origin (IATA code / station / airport). */
  from?: string;
  /** Transport destination (IATA code / station / airport). */
  to?: string;
  /** Seat or room label, e.g. "32A" / "Deluxe King". */
  seatOrRoom?: string;
  /** Party size — pax / guests / covers. */
  party?: number;
  /** Display price string, e.g. "¥18,400". */
  price?: string;
  /** hash(vendor + locator + segment) — idempotent re-import + cancellation match by (vendor, confirmationCode). */
  sourceEmailId?: string;
}

export interface RevisionDelta {
  id: string;
  type: 'move' | 'add' | 'drop' | 'time-shift' | 'pin-change' | 'makeup' | 'confirm';
  itemTitle: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface CopilotMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  suggestion?: {
    type: 'Suggested Adjustment' | 'Smart Add' | 'Conflict Alert';
    title: string;
    description: string;
    timeShift?: {
      from: string;
      to: string;
    };
    actionLabel?: string;
    onApply?: string; // Action label code
    itemsToAdd?: PlaceItem[]; // List of items extracted from link or blog to add to pocket
  };
}

export interface ItineraryDay {
  id: string;
  label: string; // e.g. "Mon"
  date: string;  // e.g. "12"
  fullDateString: string; // "Monday, April 15"
  areaSummary?: string;
}

export interface TripArchiveItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  stopCount: number;
  status: 'upcoming' | 'completed' | 'draft' | 'archived';
  imageUrl?: string;
  participants?: string[];
  destination: string;
  archiveEntryNumber?: number;
}

export interface AppState {
  tripBrief: TripBrief;
  itineraryDays: ItineraryDay[];
  itineraryItems: ItineraryItem[];
  pocket: PocketColumn[];
  bookings: BookingRecord[];
  selectedItemId?: string;
  selectedDayId: string; // current active focus day
  revisionDeltas: RevisionDelta[];
  currentView: 'plan' | 'trips' | 'explore' | 'pocket'; // 'pocket' = global Research Pocket board (Agent 9 approved, additive)
}

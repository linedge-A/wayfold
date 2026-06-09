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
  confirmed: boolean;
  cancelable?: boolean;
  linkedItemId?: string;
  date?: string;
  time?: string;
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
  currentView: 'plan' | 'trips' | 'explore';
}

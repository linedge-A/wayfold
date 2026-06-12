/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trip registry — the set of fully-authored trips the planner can load.
 * Keyed by `tripBrief.id` so a Trips-list card or nav item can switch the
 * active trip by id. Currently: Kyoto (the default demo) and the Iceland
 * Ring Road family trip.
 */
import {
  TripBrief, ItineraryDay, ItineraryItem, PocketColumn, BookingRecord, RevisionDelta, CopilotMessage
} from '@/shared/types/index';
import {
  INITIAL_TRIP_BRIEF, INITIAL_DAYS, INITIAL_ITINERARY_ITEMS, INITIAL_POCKET,
  INITIAL_BOOKINGS, INITIAL_REVISION_DELTAS, INITIAL_MESSAGES
} from '@/shared/mock-data/seedData';
import { ICELAND_FAMILY_TRIP } from '@/shared/mock-data/icelandFamilyTrip';

export interface TripDataset {
  tripBrief: TripBrief;
  itineraryDays: ItineraryDay[];
  itineraryItems: ItineraryItem[];
  pocket: PocketColumn[];
  bookings: BookingRecord[];
  revisionDeltas: RevisionDelta[];
  messages: CopilotMessage[];
}

export const TRIPS: Record<string, TripDataset> = {
  // Kyoto — the default working demo
  [INITIAL_TRIP_BRIEF.id]: {
    tripBrief: INITIAL_TRIP_BRIEF,
    itineraryDays: INITIAL_DAYS,
    itineraryItems: INITIAL_ITINERARY_ITEMS,
    pocket: INITIAL_POCKET,
    bookings: INITIAL_BOOKINGS,
    revisionDeltas: INITIAL_REVISION_DELTAS,
    messages: INITIAL_MESSAGES,
  },
  // Iceland Ring Road — family (a ready, experiential trip)
  [ICELAND_FAMILY_TRIP.tripBrief.id]: {
    tripBrief: ICELAND_FAMILY_TRIP.tripBrief,
    itineraryDays: ICELAND_FAMILY_TRIP.itineraryDays,
    itineraryItems: ICELAND_FAMILY_TRIP.itineraryItems,
    pocket: ICELAND_FAMILY_TRIP.pocket,
    bookings: ICELAND_FAMILY_TRIP.bookings,
    revisionDeltas: [],
    messages: [],
  },
};

/** A trip is loadable iff it has an authored dataset in the registry. */
export const getTrip = (id: string): TripDataset | undefined => TRIPS[id];
export const isLoadableTrip = (id: string): boolean => id in TRIPS;

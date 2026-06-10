/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Iceland Ring Road — Family track.
 *
 * A second, selectable seeded example trip (the canonical demo remains Kyoto in
 * seedData.ts). Single family-with-kids party, ~10 days, Route 1 clockwise, in
 * April. Family pacing: short drive legs, kid-friendly stops (geothermal pools,
 * easy waterfalls, farm/animal stops), early dinners, and a few aurora evenings
 * modeled as soft, natural-timing items. Self-drive SUV.
 *
 * All coordinates are real Iceland lat/lng (lat ~63–66, lng ~ -14 to -23).
 * This file is additive and owns no shared truth from seedData.ts — only the
 * Trips-archive entry lives there so the trip is selectable in the Trips list.
 */
import { ItineraryItem, PocketColumn, BookingRecord, TripArchiveItem } from '@/shared/types/index';

export const ICELAND_FAMILY_TRIP_BRIEF = {
  id: 'iceland-ring-family-2027',
  title: 'Iceland Ring Road — Family',
  destination: 'Iceland (Route 1)',
  startDate: '2027-04-03',
  endDate: '2027-04-12',
  flexibleDates: false,
  style: 'relaxing' as const, // family pace: relaxed → balanced
  transport: 'drive' as const,
  notes:
    'Family with young kids. Short drive legs, kid-friendly stops (pools, easy waterfalls, farm animals), early dinners, and a few aurora evenings. Self-drive SUV, Ring Road clockwise.',
  image: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?q=80&w=600&auto=format&fit=crop'
};

export const ICELAND_FAMILY_DAYS = [
  { id: 'isl-day-1', label: 'SAT', date: '3', fullDateString: 'Saturday, April 3', areaSummary: 'Arrive KEF · Blue Lagoon · Reykjavík' },
  { id: 'isl-day-2', label: 'SUN', date: '4', fullDateString: 'Sunday, April 4', areaSummary: 'Golden Circle' },
  { id: 'isl-day-3', label: 'MON', date: '5', fullDateString: 'Monday, April 5', areaSummary: 'South Coast Waterfalls · Vík' },
  { id: 'isl-day-4', label: 'TUE', date: '6', fullDateString: 'Tuesday, April 6', areaSummary: 'Skaftafell Glacier' },
  { id: 'isl-day-5', label: 'WED', date: '7', fullDateString: 'Wednesday, April 7', areaSummary: 'Jökulsárlón · Höfn' },
  { id: 'isl-day-6', label: 'THU', date: '8', fullDateString: 'Thursday, April 8', areaSummary: 'East Fjords · Egilsstaðir' },
  { id: 'isl-day-7', label: 'FRI', date: '9', fullDateString: 'Friday, April 9', areaSummary: 'Dettifoss · Mývatn' },
  { id: 'isl-day-8', label: 'SAT', date: '10', fullDateString: 'Saturday, April 10', areaSummary: 'Goðafoss · Akureyri' },
  { id: 'isl-day-9', label: 'SUN', date: '11', fullDateString: 'Sunday, April 11', areaSummary: 'North → West · Borgarnes' },
  { id: 'isl-day-10', label: 'MON', date: '12', fullDateString: 'Monday, April 12', areaSummary: 'Reykjavík · Depart KEF' }
];

export const ICELAND_FAMILY_ITINERARY_ITEMS: ItineraryItem[] = [
  // ── Day 1 — Arrival, ease in ──
  { id: 'isl-kef-arrive', dayId: 'isl-day-1', title: 'Arrive Keflavík (KEF) · pick up SUV', category: 'transit', area: 'Reykjanes', lat: 63.9850, lng: -22.6056, startTime: '09:00 AM', endTime: '10:30 AM', pinState: 'hard', priority: 'must', reservationBound: true, estimatedDurationMin: 90, note: 'Flight + rental pickup' },
  { id: 'isl-blue-lagoon', dayId: 'isl-day-1', title: 'Blue Lagoon (timed entry)', category: 'sight', area: 'Grindavík', lat: 63.8804, lng: -22.4495, startTime: '12:00 PM', endTime: '02:30 PM', pinState: 'hard', priority: 'high', reservationBound: true, openingHours: '8 AM - 9 PM', estimatedDurationMin: 150, note: 'Pre-booked · kid-friendly soak after the flight' },
  { id: 'isl-rvk-checkin', dayId: 'isl-day-1', title: 'Check-in Reykjavík family apartment', category: 'stay', area: 'Reykjavík', lat: 64.1466, lng: -21.9426, startTime: '04:00 PM', endTime: '04:30 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },
  { id: 'isl-hlemmur', dayId: 'isl-day-1', title: 'Hlemmur Mathöll food hall dinner', category: 'food', area: 'Reykjavík', lat: 64.1430, lng: -21.9100, startTime: '06:00 PM', endTime: '07:30 PM', pinState: 'none', priority: 'medium', estimatedDurationMin: 90, note: 'Food market — easy choices for kids' },

  // ── Day 2 — Golden Circle ──
  { id: 'isl-thingvellir', dayId: 'isl-day-2', title: 'Þingvellir National Park', category: 'sight', area: 'Golden Circle', lat: 64.2558, lng: -21.1300, startTime: '09:30 AM', endTime: '11:00 AM', pinState: 'none', priority: 'high', estimatedDurationMin: 90 },
  { id: 'isl-geysir', dayId: 'isl-day-2', title: 'Geysir & Strokkur eruptions', category: 'sight', area: 'Haukadalur', lat: 64.3104, lng: -20.3024, startTime: '11:45 AM', endTime: '12:45 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 60, note: 'Kids love the eruption every few minutes' },
  { id: 'isl-gullfoss', dayId: 'isl-day-2', title: 'Gullfoss waterfall', category: 'sight', area: 'Golden Circle', lat: 64.3271, lng: -20.1199, startTime: '01:15 PM', endTime: '02:15 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 60 },
  { id: 'isl-kerid', dayId: 'isl-day-2', title: 'Kerið volcanic crater (quick stop)', category: 'sight', area: 'Grímsnes', lat: 64.0413, lng: -20.8856, startTime: '03:30 PM', endTime: '04:00 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 30 },
  { id: 'isl-hella-stay', dayId: 'isl-day-2', title: 'Guesthouse near Hella', category: 'stay', area: 'Hella', lat: 63.8333, lng: -20.3900, startTime: '05:30 PM', endTime: '06:00 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },

  // ── Day 3 — South Coast waterfalls → Vík ──
  { id: 'isl-seljalandsfoss', dayId: 'isl-day-3', title: 'Seljalandsfoss (walk behind falls)', category: 'sight', area: 'South Coast', lat: 63.6156, lng: -19.9886, startTime: '09:30 AM', endTime: '10:30 AM', pinState: 'none', priority: 'high', estimatedDurationMin: 60 },
  { id: 'isl-skogafoss', dayId: 'isl-day-3', title: 'Skógafoss waterfall', category: 'sight', area: 'South Coast', lat: 63.5320, lng: -19.5114, startTime: '11:15 AM', endTime: '12:15 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 60 },
  { id: 'isl-reynisfjara', dayId: 'isl-day-3', title: 'Reynisfjara black sand beach', category: 'sight', area: 'Vík', lat: 63.4061, lng: -19.0447, startTime: '02:00 PM', endTime: '03:00 PM', pinState: 'soft', priority: 'high', estimatedDurationMin: 60, note: 'Sneaker waves — hold kids’ hands, stay well back' },
  { id: 'isl-vik-stay', dayId: 'isl-day-3', title: 'Check-in Vík guesthouse', category: 'stay', area: 'Vík í Mýrdal', lat: 63.4194, lng: -19.0060, startTime: '04:30 PM', endTime: '05:00 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },
  { id: 'isl-vik-aurora', dayId: 'isl-day-3', title: 'Aurora watch — Vík church hill', category: 'sight', area: 'Vík í Mýrdal', lat: 63.4180, lng: -19.0060, startTime: '09:30 PM', endTime: '10:30 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 60, note: 'Natural timing — go only if the Kp forecast is up' },

  // ── Day 4 — Skaftafell glacier ──
  { id: 'isl-skaftafell', dayId: 'isl-day-4', title: 'Skaftafell · Svartifoss family walk', category: 'sight', area: 'Vatnajökull NP', lat: 64.0159, lng: -16.9666, startTime: '10:00 AM', endTime: '12:30 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 150 },
  { id: 'isl-glacier-walk', dayId: 'isl-day-4', title: 'Guided glacier walk (beginner)', category: 'sight', area: 'Skaftafell', lat: 64.0100, lng: -16.9700, startTime: '01:30 PM', endTime: '03:30 PM', pinState: 'hard', priority: 'must', reservationBound: true, estimatedDurationMin: 120, note: 'Crampons provided · min age 8 · booked' },
  { id: 'isl-hof-stay', dayId: 'isl-day-4', title: 'Farm stay near Hof', category: 'stay', area: 'Öræfi', lat: 63.9200, lng: -16.7000, startTime: '05:00 PM', endTime: '05:30 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },

  // ── Day 5 — Glacier lagoon → Höfn ──
  { id: 'isl-jokulsarlon', dayId: 'isl-day-5', title: 'Jökulsárlón glacier lagoon', category: 'sight', area: 'Vatnajökull', lat: 64.0784, lng: -16.2306, startTime: '10:00 AM', endTime: '11:30 AM', pinState: 'none', priority: 'must', estimatedDurationMin: 90, note: 'Icebergs & seals — kids’ highlight' },
  { id: 'isl-diamond-beach', dayId: 'isl-day-5', title: 'Diamond Beach', category: 'sight', area: 'Breiðamerkursandur', lat: 64.0438, lng: -16.1772, startTime: '11:45 AM', endTime: '12:45 PM', pinState: 'soft', priority: 'high', estimatedDurationMin: 60 },
  { id: 'isl-hofn-stay', dayId: 'isl-day-5', title: 'Check-in Höfn harbour stay', category: 'stay', area: 'Höfn', lat: 64.2539, lng: -15.2082, startTime: '03:30 PM', endTime: '04:00 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },
  { id: 'isl-pakkhus', dayId: 'isl-day-5', title: 'Pakkhús langoustine dinner', category: 'food', area: 'Höfn', lat: 64.2511, lng: -15.2030, startTime: '06:00 PM', endTime: '07:30 PM', pinState: 'hard', priority: 'high', reservationBound: true, estimatedDurationMin: 90, note: 'Höfn is the langoustine capital · reserved' },

  // ── Day 6 — East Fjords → Egilsstaðir (longer leg, broken up) ──
  { id: 'isl-djupivogur', dayId: 'isl-day-6', title: 'Djúpivogur break + playground', category: 'transit', area: 'East Fjords', lat: 64.6560, lng: -14.2800, startTime: '10:30 AM', endTime: '11:30 AM', pinState: 'none', priority: 'medium', estimatedDurationMin: 60, note: 'Leg-stretch on a long driving day' },
  { id: 'isl-seydisfjordur', dayId: 'isl-day-6', title: 'Seyðisfjörður rainbow street', category: 'sight', area: 'Seyðisfjörður', lat: 65.2627, lng: -14.0090, startTime: '02:00 PM', endTime: '03:30 PM', pinState: 'soft', priority: 'high', estimatedDurationMin: 90, note: 'Detour over Fjarðarheiði pass — check road & weather' },
  { id: 'isl-egil-stay', dayId: 'isl-day-6', title: 'Check-in Egilsstaðir', category: 'stay', area: 'Egilsstaðir', lat: 65.2627, lng: -14.3948, startTime: '05:00 PM', endTime: '05:30 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },

  // ── Day 7 — Dettifoss → Mývatn ──
  { id: 'isl-dettifoss', dayId: 'isl-day-7', title: 'Dettifoss waterfall', category: 'sight', area: 'Vatnajökull NP North', lat: 65.8149, lng: -16.3847, startTime: '10:30 AM', endTime: '11:30 AM', pinState: 'none', priority: 'high', estimatedDurationMin: 60, note: 'Road 862 — confirm it is open in April' },
  { id: 'isl-myvatn-craters', dayId: 'isl-day-7', title: 'Skútustaðagígar pseudo-craters', category: 'sight', area: 'Mývatn', lat: 65.5700, lng: -17.0000, startTime: '01:30 PM', endTime: '02:30 PM', pinState: 'none', priority: 'medium', estimatedDurationMin: 60 },
  { id: 'isl-myvatn-baths', dayId: 'isl-day-7', title: 'Mývatn Nature Baths', category: 'sight', area: 'Mývatn', lat: 65.6307, lng: -16.8475, startTime: '03:30 PM', endTime: '05:30 PM', pinState: 'hard', priority: 'high', reservationBound: true, estimatedDurationMin: 120, note: 'Geothermal soak · kid-friendly · pre-booked' },
  { id: 'isl-myvatn-stay', dayId: 'isl-day-7', title: 'Check-in Sel-Hótel Mývatn', category: 'stay', area: 'Mývatn', lat: 65.5658, lng: -17.0010, startTime: '06:00 PM', endTime: '06:30 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },
  { id: 'isl-myvatn-aurora', dayId: 'isl-day-7', title: 'Aurora watch — Lake Mývatn', category: 'sight', area: 'Mývatn', lat: 65.6039, lng: -16.9962, startTime: '09:30 PM', endTime: '10:30 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 60, note: 'Natural timing — dark skies, low light pollution' },

  // ── Day 8 — Goðafoss → Akureyri ──
  { id: 'isl-godafoss', dayId: 'isl-day-8', title: 'Goðafoss — waterfall of the gods', category: 'sight', area: 'Bárðardalur', lat: 65.6829, lng: -17.5500, startTime: '10:00 AM', endTime: '11:00 AM', pinState: 'none', priority: 'high', estimatedDurationMin: 60 },
  { id: 'isl-akureyri-town', dayId: 'isl-day-8', title: 'Akureyri town & botanic garden', category: 'sight', area: 'Akureyri', lat: 65.6885, lng: -18.1262, startTime: '12:30 PM', endTime: '02:00 PM', pinState: 'none', priority: 'medium', estimatedDurationMin: 90 },
  { id: 'isl-akureyri-pool', dayId: 'isl-day-8', title: 'Akureyri thermal pool (kids’ slides)', category: 'sight', area: 'Akureyri', lat: 65.6800, lng: -18.0900, startTime: '02:30 PM', endTime: '04:00 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 90, note: 'Local pool — a kid favorite' },
  { id: 'isl-akureyri-stay', dayId: 'isl-day-8', title: 'Check-in Akureyri', category: 'stay', area: 'Akureyri', lat: 65.6885, lng: -18.1262, startTime: '04:30 PM', endTime: '05:00 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },

  // ── Day 9 — North → West (big driving day) ──
  { id: 'isl-hvitserkur', dayId: 'isl-day-9', title: 'Hvítserkur sea stack (troll rock)', category: 'sight', area: 'Vatnsnes', lat: 65.6058, lng: -20.6378, startTime: '11:30 AM', endTime: '12:30 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 60, note: 'Big transfer day — Akureyri → West Iceland' },
  { id: 'isl-borgarnes-lunch', dayId: 'isl-day-9', title: 'Borgarnes Settlement Center break', category: 'food', area: 'Borgarnes', lat: 64.5383, lng: -21.9220, startTime: '04:00 PM', endTime: '05:00 PM', pinState: 'none', priority: 'medium', estimatedDurationMin: 60 },
  { id: 'isl-borgarnes-stay', dayId: 'isl-day-9', title: 'Check-in Borgarnes', category: 'stay', area: 'Borgarnes', lat: 64.5383, lng: -21.9220, startTime: '05:30 PM', endTime: '06:00 PM', pinState: 'none', priority: 'high', estimatedDurationMin: 30 },

  // ── Day 10 — Back to Reykjavík, depart ──
  { id: 'isl-rvk-return', dayId: 'isl-day-10', title: 'Drive Borgarnes → Reykjavík', category: 'transit', area: 'West → Reykjavík', lat: 64.1466, lng: -21.9426, startTime: '09:30 AM', endTime: '10:30 AM', pinState: 'none', priority: 'medium', estimatedDurationMin: 60 },
  { id: 'isl-perlan', dayId: 'isl-day-10', title: 'Perlan — Wonders of Iceland (indoor)', category: 'sight', area: 'Reykjavík', lat: 64.1290, lng: -21.9190, startTime: '11:00 AM', endTime: '01:00 PM', pinState: 'soft', priority: 'medium', estimatedDurationMin: 120, note: 'Indoor buffer before the flight — ice cave & planetarium' },
  { id: 'isl-kef-depart', dayId: 'isl-day-10', title: 'Return SUV & depart KEF', category: 'transit', area: 'Reykjanes', lat: 63.9850, lng: -22.6056, startTime: '03:30 PM', endTime: '05:30 PM', pinState: 'hard', priority: 'must', reservationBound: true, estimatedDurationMin: 120, note: 'Backward-chained from flight: car drop + check-in + security' }
];

export const ICELAND_FAMILY_POCKET: PocketColumn[] = [
  {
    id: 'isl-maybe',
    title: 'MAYBE / BACKUP',
    items: [
      { id: 'isl-kirkjufell', title: 'Kirkjufell & Snæfellsnes', category: 'sight', area: 'Snæfellsnes', tags: ['mountain', 'photo'], subCategory: 'Nature', budget: 'Free', openingHours: '24 Hrs', lat: 64.9416, lng: -23.3066 },
      { id: 'isl-horse-farm', title: 'Icelandic horse farm visit', category: 'sight', area: 'South Iceland', tags: ['kids', 'animals'], subCategory: 'Family', budget: 'ISK 6,500', openingHours: 'By appointment', lat: 63.9900, lng: -20.5000 }
    ]
  },
  {
    id: 'isl-food',
    title: 'FOOD & DRINK',
    items: [
      { id: 'isl-baejarins', title: 'Bæjarins Beztu Pylsur (hot dogs)', category: 'food', area: 'Reykjavík', tags: ['streetfood', 'kids'], subCategory: 'Street Food', budget: 'ISK 700', openingHours: '10 AM - 1 AM', lat: 64.1485, lng: -21.9408 },
      { id: 'isl-braud-co', title: 'Brauð & Co bakery', category: 'food', area: 'Reykjavík', tags: ['bakery', 'breakfast'], subCategory: 'Bakery', budget: 'ISK 900', openingHours: '7 AM - 6 PM', lat: 64.1463, lng: -21.9270 }
    ]
  }
];

export const ICELAND_FAMILY_BOOKINGS: BookingRecord[] = [
  { id: 'isl-bk-rvk', title: 'Reykjavík family apartment', category: 'hotel', confirmationCode: 'RVK-FAM-7741', confirmed: true, cancelable: true, linkedItemId: 'isl-rvk-checkin' },
  { id: 'isl-bk-bluelagoon', title: 'Blue Lagoon timed entry (4 pax)', category: 'ticket', confirmationCode: 'BL-220417', confirmed: true, cancelable: false, linkedItemId: 'isl-blue-lagoon' },
  { id: 'isl-bk-glacier', title: 'Skaftafell glacier walk (family)', category: 'ticket', confirmationCode: 'ICEGUIDE-5589', confirmed: true, cancelable: false, linkedItemId: 'isl-glacier-walk' },
  { id: 'isl-bk-pakkhus', title: 'Pakkhús dinner — Höfn', category: 'restaurant', confirmationCode: 'PAKK-0412', confirmed: true, cancelable: true, linkedItemId: 'isl-pakkhus' },
  { id: 'isl-bk-myvatnbaths', title: 'Mývatn Nature Baths (4 pax)', category: 'ticket', confirmationCode: 'MNB-90233', confirmed: true, cancelable: true, linkedItemId: 'isl-myvatn-baths' }
];

/**
 * Convenience bundle for whoever wires the Trips switcher (Agent 0 / shell):
 * drop these straight into AppState. Kept here so no shell change is needed yet.
 */
export const ICELAND_FAMILY_TRIP = {
  tripBrief: ICELAND_FAMILY_TRIP_BRIEF,
  itineraryDays: ICELAND_FAMILY_DAYS,
  itineraryItems: ICELAND_FAMILY_ITINERARY_ITEMS,
  pocket: ICELAND_FAMILY_POCKET,
  bookings: ICELAND_FAMILY_BOOKINGS
};

/** Trips-archive card for the Iceland family trip (added into INITIAL_TRIP_ARCHIVE). */
export const ICELAND_FAMILY_ARCHIVE_ITEM: TripArchiveItem = {
  id: 'iceland-ring-family-2027',
  title: 'Iceland Ring Road — Family',
  destination: 'Iceland (Route 1)',
  startDate: 'Apr 3, 2027',
  endDate: 'Apr 12, 2027',
  stopCount: ICELAND_FAMILY_ITINERARY_ITEMS.length,
  status: 'upcoming',
  imageUrl: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?q=80&w=600&auto=format&fit=crop',
  participants: ['usr-1', 'usr-2', 'usr-3', 'usr-4']
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, ItineraryItem, PocketColumn, BookingRecord, TripArchiveItem } from '@/shared/types/index';
import { ICELAND_FAMILY_ARCHIVE_ITEM } from '@/shared/mock-data/icelandFamilyTrip';

export const INITIAL_TRIP_ARCHIVE: TripArchiveItem[] = [
  ICELAND_FAMILY_ARCHIVE_ITEM,
  {
    id: 'trip-archive-1',
    title: 'Neon Nights: Tokyo Tech Tour',
    destination: 'Tokyo, Japan',
    startDate: 'Nov 10, 2026',
    endDate: 'Nov 14, 2026',
    stopCount: 8,
    status: 'upcoming',
    imageUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=600&auto=format&fit=crop',
    participants: ['usr-1', 'usr-2', 'usr-3']
  },
  {
    id: 'trip-archive-2',
    title: 'Amalfi Heritage & Gastronomy',
    destination: 'Amalfi Coast, Italy',
    startDate: 'Sept 12, 2024',
    endDate: 'Sept 20, 2024',
    stopCount: 14,
    status: 'completed',
    imageUrl: 'https://images.unsplash.com/photo-1523906834658-6e24ef2382f9?q=80&w=600&auto=format&fit=crop',
    archiveEntryNumber: 284
  },
  {
    id: 'trip-archive-3',
    title: 'Parisian Autumn Residency',
    destination: 'Paris, France',
    startDate: 'Oct 02, 2023',
    endDate: 'Oct 09, 2023',
    stopCount: 6,
    status: 'completed',
    imageUrl: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=600&auto=format&fit=crop',
    archiveEntryNumber: 241
  },
  {
    id: 'trip-archive-4',
    title: 'Kyoto Exploration',
    destination: 'Kyoto, Japan',
    startDate: 'Nov 03, 2022',
    endDate: 'Nov 10, 2022',
    stopCount: 12,
    status: 'archived',
    imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=600&auto=format&fit=crop'
  },
  {
    id: 'trip-archive-5',
    title: 'Santorini Escape',
    destination: 'Santorini, Greece',
    startDate: 'Dates not set',
    endDate: '',
    stopCount: 0,
    status: 'draft',
    imageUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?q=80&w=600&auto=format&fit=crop'
  }
];

export const INITIAL_TRIP_BRIEF = {
  id: 'kyoto-spring-2024',
  title: 'Kyoto Spring 2024',
  destination: 'Kyoto, Japan',
  startDate: '2024-04-12',
  endDate: '2024-04-20',
  flexibleDates: false,
  style: 'relaxing' as const,
  transport: 'transit' as const,
  notes: 'Relaxing trip, classic temples, focus on amazing traditional local food.',
  image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCxljkG3UX5_XBhiUzV6IVWsJJUoANfwarMqsx4ikueZZtoCBc4cij8gXW13LMZIEFA82GMTr4RYLzdLE_6KyIyUoflaUWRDBi0Zg-0Zd_e3B3BtLAuKpRBqFcbOMzq5aEmK2jp7EjPRK7sBGPz-svaBeRIKcwAN_jm80jgRAChfB1YpxyxIAPFNUYTC-TWo5Q5zhw8KiNIMqQO4jwzQ5EWG8dLvKNWq6Qcteekz6To-othLPRiRASwba453_P5pMzN6NTjM9XwHa4'
};

export const INITIAL_DAYS = [
  { id: 'day-1', label: 'MON', date: '12', fullDateString: 'Monday, April 12', areaSummary: 'Arrval & Ease In' },
  { id: 'day-2', label: 'TUE', date: '13', fullDateString: 'Tuesday, April 13', areaSummary: 'Higashiyama Exploration' },
  { id: 'day-3', label: 'WED', date: '14', fullDateString: 'Wednesday, April 14', areaSummary: 'Arashiyama River & Zen' },
  { id: 'day-4', label: 'THU', date: '15', fullDateString: 'Thursday, April 15', areaSummary: 'Shrines & Central Kyoto' },
  { id: 'day-5', label: 'FRI', date: '16', fullDateString: 'Friday, April 16', areaSummary: 'Nara Side Journey' },
  { id: 'day-6', label: 'SAT', date: '17', fullDateString: 'Saturday, April 17', areaSummary: 'Alleys & Dining' },
  { id: 'day-7', label: 'SUN', date: '18', fullDateString: 'Sunday, April 18', areaSummary: 'Departure to Tokyo' }
];

export const INITIAL_ITINERARY_ITEMS: ItineraryItem[] = [
  // Day 1
  {
    id: 'place-kix',
    dayId: 'day-1',
    title: 'Arrive KIX Airport',
    category: 'transit',
    area: 'Osaka/KIX',
    lat: 34.4320,
    lng: 135.2304,
    startTime: '09:00 AM',
    endTime: '11:00 AM',
    pinState: 'hard',
    priority: 'must',
    note: 'Haruka Express',
    estimatedDurationMin: 120,
    reservationBound: true
  },
  {
    id: 'place-ace',
    dayId: 'day-1',
    title: 'Check-in Ace Hotel',
    category: 'stay',
    area: 'Nakagyo Ward',
    lat: 35.0112,
    lng: 135.7593,
    startTime: '02:00 PM',
    endTime: '03:00 PM',
    pinState: 'none',
    priority: 'high',
    estimatedDurationMin: 60
  },
  // Day 2
  {
    id: 'place-kiyomizu',
    dayId: 'day-2',
    title: 'Kiyomizu-dera Temple',
    category: 'sight',
    area: 'Higashiyama District',
    lat: 34.9949,
    lng: 135.7850,
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    pinState: 'none',
    priority: 'high',
    estimatedDurationMin: 90,
    imageUrl: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'place-nishiki-lunch',
    dayId: 'day-2',
    title: 'Nishiki Market Lunch',
    category: 'food',
    area: 'Central Ward',
    lat: 35.0050,
    lng: 135.7649,
    startTime: '01:00 PM',
    endTime: '02:30 PM',
    pinState: 'none',
    priority: 'medium',
    estimatedDurationMin: 90,
    imageUrl: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?q=80&w=300&auto=format&fit=crop'
  },
  // Day 3
  {
    id: 'place-bamboo',
    dayId: 'day-3',
    title: 'Arashiyama Bamboo',
    category: 'sight',
    area: 'Arashiyama',
    lat: 35.0156,
    lng: 135.6715,
    startTime: '08:00 AM',
    endTime: '09:30 AM',
    pinState: 'none',
    priority: 'high',
    estimatedDurationMin: 90,
    transitFromPrevMin: 45,
    imageUrl: 'https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'place-shigetsu',
    dayId: 'day-3',
    title: 'Shigetsu Zen Lunch',
    category: 'food',
    area: 'Tenryu-ji Complex',
    lat: 35.0158,
    lng: 135.6776,
    startTime: '12:30 PM',
    endTime: '02:00 PM',
    pinState: 'hard',
    priority: 'must',
    note: 'Confirmed',
    estimatedDurationMin: 90,
    reservationBound: true,
    imageUrl: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?q=80&w=300&auto=format&fit=crop'
  },
  {
    id: 'place-otagi',
    dayId: 'day-3',
    title: 'Otagi Nenbutsu-ji',
    category: 'sight',
    area: 'Arashiyama North',
    lat: 35.0294,
    lng: 135.6622,
    startTime: '03:00 PM',
    endTime: '04:30 PM',
    pinState: 'soft',
    priority: 'medium',
    estimatedDurationMin: 90,
    imageUrl: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=300&auto=format&fit=crop'
  },
  // Day 4
  {
    id: 'place-fushimi',
    dayId: 'day-4',
    title: 'Fushimi Inari Gates',
    category: 'sight',
    area: 'Fushimi Ward',
    lat: 34.9671,
    lng: 135.7727,
    startTime: '09:00 AM',
    endTime: '11:00 AM',
    pinState: 'none',
    priority: 'high',
    estimatedDurationMin: 120,
    imageUrl: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?q=80&w=300&auto=format&fit=crop'
  },
  // Day 5
  {
    id: 'place-nara',
    dayId: 'day-5',
    title: 'Day Trip to Nara',
    category: 'transit',
    area: 'Nara Park',
    lat: 34.6851,
    lng: 135.8430,
    startTime: '10:00 AM',
    endTime: '04:00 PM',
    pinState: 'hard',
    priority: 'must',
    note: 'Kintetsu Rail',
    estimatedDurationMin: 360,
    reservationBound: true
  },
  // Day 6
  {
    id: 'place-pontocho',
    dayId: 'day-6',
    title: 'Pontocho Alley Dinner',
    category: 'food',
    area: 'Pontocho',
    lat: 35.0062,
    lng: 135.7709,
    startTime: '07:00 PM',
    endTime: '09:00 PM',
    pinState: 'none',
    priority: 'high',
    estimatedDurationMin: 120
  },
  // Day 7
  {
    id: 'place-tokyo',
    dayId: 'day-7',
    title: 'Depart for Tokyo',
    category: 'transit',
    area: 'Kyoto Station',
    lat: 34.9858,
    lng: 135.7588,
    startTime: '11:00 AM',
    endTime: '01:00 PM',
    pinState: 'hard',
    priority: 'must',
    note: 'Shinkansen Nozomi',
    estimatedDurationMin: 120,
    reservationBound: true
  }
];

export const INITIAL_POCKET: PocketColumn[] = [
  {
    id: 'must-see',
    title: 'MUST SEE',
    items: [
      { 
        id: 'place-nijo', 
        title: 'Nijo Castle', 
        category: 'sight', 
        area: 'Nijo Ward', 
        tags: ['castle', 'historical'], 
        subCategory: 'Historical', 
        budget: '¥1,000', 
        openingHours: '8:45 AM - 5 PM', 
        imageUrl: 'https://images.unsplash.com/photo-1624238517594-5cb8d7065f4d?q=80&w=300&auto=format&fit=crop',
        lat: 35.0142,
        lng: 135.7482
      },
      { 
        id: 'place-arashiyama-full', 
        title: 'Arashiyama', 
        category: 'sight', 
        area: 'Arashiyama District', 
        tags: ['nature', 'bamboo'], 
        subCategory: 'Nature', 
        budget: 'Free', 
        openingHours: '24 Hrs', 
        imageUrl: 'https://images.unsplash.com/photo-1549488344-1f9b8d2bd1f3?q=80&w=300&auto=format&fit=crop',
        lat: 35.0094,
        lng: 135.6668
      }
    ]
  },
  {
    id: 'food-drink',
    title: 'FOOD & DRINK',
    items: [
      { 
        id: 'place-nishiki-market-save', 
        title: 'Nishiki Market', 
        category: 'food', 
        area: 'Central Ward', 
        tags: ['markets', 'streetfood'], 
        subCategory: 'Street Food', 
        budget: '¥1,500', 
        openingHours: '9 AM - 6 PM', 
        imageUrl: 'https://images.unsplash.com/photo-1580822184713-fc5400e7fe10?q=80&w=300&auto=format&fit=crop',
        lat: 35.0050,
        lng: 135.7649
      },
      { 
        id: 'place-kurasu', 
        title: 'Kurasu Coffee', 
        category: 'food', 
        area: 'Shimogyo Ward', 
        tags: ['cafe', 'specialty'], 
        subCategory: 'Specialty Cafe', 
        budget: '¥800', 
        openingHours: '8 AM - 6 PM', 
        imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef03a7403f?q=80&w=300&auto=format&fit=crop',
        lat: 34.9875,
        lng: 135.7570
      }
    ]
  }
];

export const INITIAL_BOOKINGS: BookingRecord[] = [
  {
    id: 'booking-hotel',
    title: 'Ace Hotel Kyoto Stay',
    category: 'hotel',
    confirmationCode: 'ACE-88219-X',
    confirmed: true,
    cancelable: true,
    linkedItemId: 'place-ace'
  },
  {
    id: 'booking-shigetsu',
    title: 'Shigetsu Zen Lunch Seat',
    category: 'restaurant',
    confirmationCode: 'TENRYU-552',
    confirmed: true,
    cancelable: false,
    linkedItemId: 'place-shigetsu'
  }
];

export const INITIAL_REVISION_DELTAS = [
  {
    id: 'delta-1',
    type: 'move' as const,
    itemTitle: 'Kiyomizu-dera',
    from: '1:00 PM',
    to: '10:00 AM',
    note: 'Moved to morning to avoid midday heat and peak tourist crowds.'
  },
  {
    id: 'delta-2',
    type: 'add' as const,
    itemTitle: 'Arashiyama Bamboo Grove Walkway',
    to: '8:00 AM',
    note: 'Added walking buffers between all transit stops.'
  }
];

export const INITIAL_MESSAGES = [
  {
    id: 'msg-1',
    sender: 'ai' as const,
    text: 'I noticed a 4-hour gap on Thursday afternoon. Would you like to explore the Gion district or perhaps visit a traditional tea house near your hotel?',
    timestamp: 'Just now',
    suggestion: {
      type: 'Smart Add' as const,
      title: 'Traditional Tea Ceremony',
      description: 'Located 12 mins from your hotel. Highly rated for first-timers.',
      actionLabel: 'Add to Thursday'
    }
  },
  {
    id: 'msg-2',
    sender: 'ai' as const,
    text: 'I also noticed that Shigetsu Zen Lunch is scheduled on Wednesday. Arashiyama is usually crowded on Wednesdays. Consider moving it to 11:30 AM?',
    timestamp: '1 min ago',
    suggestion: {
      type: 'Conflict Alert' as const,
      title: 'Shigetsu Zen Lunch Conflict',
      description: 'Wednesday congestion in Arashiyama. Shifting avoids wait lines.',
      timeShift: {
        from: '12:30 PM',
        to: '11:30 AM'
      },
      actionLabel: 'Reschedule to 11:30 AM'
    }
  }
];
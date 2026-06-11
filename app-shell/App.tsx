/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ... (keep initial comments)
import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Map, Bot, Compass, Plus, ShieldAlert, Calendar } from 'lucide-react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
// ...
import TopHeader from './TopHeader';
import { placeItemsToPool } from '@/modules/trip-brief/placeItemsToPool';
import { applyBookings } from '@/modules/ingestion/applyBookings';
import { regenerateFromPocket } from '@/modules/trip-brief/regenerateFromPocket';
import ItineraryPanel from '@/modules/itinerary/ItineraryPanel';
import MapPanel from '@/modules/map/MapPanel';
import PocketPanel from '@/modules/pocket/PocketPanel';
import CopilotPanel from '@/modules/copilot/CopilotPanel';
import FocusModeSplash from './FocusModeSplash';
import SourceOfTruthSheet from './SourceOfTruthSheet';
import { optimizeSchedule, OptimizationResult, ProposedChange } from '@/modules/constraint-engine/optimizer';
import OptimizeScheduleModal from '@/modules/constraint-engine/OptimizeScheduleModal';
import TripsPage from './TripsPage';
import ExplorePage from './ExplorePage';
import PocketBoardPage from './PocketBoardPage';
import ShareModal from './ShareModal';
import { AppState, CopilotMessage, PlaceItem, ItineraryItem, RevisionDelta } from '@/shared/types/index';
import { INITIAL_TRIP_BRIEF, INITIAL_DAYS, INITIAL_ITINERARY_ITEMS, INITIAL_POCKET, INITIAL_BOOKINGS, INITIAL_REVISION_DELTAS, INITIAL_MESSAGES } from '@/shared/mock-data/seedData';
import { loadJSON, saveJSON, pocketKey } from '@/shared/utils/persistence';
import { getTrip } from '@/shared/mock-data/trips';
import { getLocalCopilotResponse } from '@/modules/copilot/localResponses';

import ErrorBoundary from './ErrorBoundary';
import { API_KEY, IS_VALID_KEY } from './mapsKey';

export default function App() {
  return (
    <ErrorBoundary>
      <APIProvider apiKey={IS_VALID_KEY ? API_KEY : 'MISSING_KEY'} version="weekly">
        <AppContent />
      </APIProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const placesLib = useMapsLibrary('places');

  const [appState, setAppState] = useState<AppState>({
    tripBrief: INITIAL_TRIP_BRIEF,
    itineraryDays: INITIAL_DAYS,
    itineraryItems: INITIAL_ITINERARY_ITEMS,
    // Hydrate the Research Pocket from localStorage (per trip) so saved POIs cumulate
    // across sessions; fall back to the seed pocket on first run / unavailable storage.
    pocket: loadJSON(pocketKey(INITIAL_TRIP_BRIEF.id), INITIAL_POCKET),
    bookings: INITIAL_BOOKINGS,
    selectedDayId: 'day-3', // Default to Wednesday 14th to match premium screenshot
    selectedItemId: undefined,
    revisionDeltas: INITIAL_REVISION_DELTAS,
    currentView: 'plan'
  });

  // Persist the Research Pocket per trip so saved POIs survive reloads and stay scoped to
  // their trip. (Hydration happens in the initial state above.)
  useEffect(() => {
    saveJSON(pocketKey(appState.tripBrief.id), appState.pocket);
  }, [appState.pocket, appState.tripBrief.id]);

  // Phase 3: a generated proposal (planned FROM the Research Pocket) becomes the active trip.
  // Flatten the engine's day buckets into the board's flat itineraryItems, build the day metadata,
  // and drop the now-scheduled POIs from the pocket (overflow stays behind for the user).
  const handleGenerated = (result: any) => {
    setAppState(prev => {
      const scheduledIds = new Set<string>();
      const itineraryItems = result.itineraryDays.flatMap((d: any) =>
        d.items.map((it: any) => {
          scheduledIds.add(it.id);
          return { ...it, dayId: d.id, pinState: it.pinState ?? 'none', priority: it.priority ?? 'medium', status: 'scheduled' };
        }));
      const itineraryDays = result.itineraryDays.map((d: any, i: number) => {
        const dt = d.date ? new Date(`${d.date}T00:00:00`) : null;
        const valid = dt && !Number.isNaN(dt.getTime());
        return {
          id: d.id,
          label: valid ? dt!.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : `DAY ${i + 1}`,
          date: valid ? String(dt!.getDate()) : String(i + 1),
          fullDateString: valid ? dt!.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : `Day ${i + 1}`,
          areaSummary: d.areaSummary,
        };
      });
      const pocket = prev.pocket.map(col => ({ ...col, items: col.items.filter(p => !scheduledIds.has(p.id)) }));
      return {
        ...prev,
        tripBrief: { ...prev.tripBrief, ...(result.brief ?? {}), id: prev.tripBrief.id },
        itineraryDays,
        itineraryItems,
        selectedDayId: itineraryDays[0]?.id ?? prev.selectedDayId,
        pocket,
      };
    });
  };

  const [viewType, setViewType] = useState<'day' | 'week' | 'month'>('day');
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [showComponentSheet, setShowComponentSheet] = useState<boolean>(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(INITIAL_MESSAGES);
  const [isCopilotLoading, setIsCopilotLoading] = useState<boolean>(false);
  // Staged copilot itinerary/pocket edits keyed by AI message id — reviewed + confirmed via the
  // CopilotPanel tiered "Apply" card (#27) instead of auto-applying.
  const [pendingChanges, setPendingChanges] = useState<Record<string, { base?: ItineraryItem[]; updatedItems?: ItineraryItem[]; updatedPocket?: any[]; deltas?: RevisionDelta[] }>>({});

  // "Last revised" timestamp for the header — restamped whenever the revision log changes.
  const [lastRevisedAt, setLastRevisedAt] = useState<number>(Date.now());
  useEffect(() => { setLastRevisedAt(Date.now()); }, [appState.revisionDeltas]);

  // Start over: reset the workspace to the seeded sample trip (destructive → confirm first).
  const handleStartOver = () => {
    if (typeof window !== 'undefined' && !window.confirm('Start over? This clears the current plan and reverts to the sample Kyoto trip.')) return;
    setAppState({
      tripBrief: INITIAL_TRIP_BRIEF,
      itineraryDays: INITIAL_DAYS,
      itineraryItems: INITIAL_ITINERARY_ITEMS,
      pocket: INITIAL_POCKET,
      bookings: INITIAL_BOOKINGS,
      selectedDayId: 'day-3',
      selectedItemId: undefined,
      revisionDeltas: INITIAL_REVISION_DELTAS,
      currentView: 'plan',
    });
    setMessages(INITIAL_MESSAGES);
    setPendingChanges({});
    setLastRevisedAt(Date.now());
  };

  // Optimization Modal state hooks
  const [optimizingItem, setOptimizingItem] = useState<PlaceItem | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);

  // Share Modal state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareTripData, setShareTripData] = useState<any>(null);

  const handleOpenShare = (data?: any) => {
    if (data) {
      setShareTripData(data);
    } else {
      setShareTripData({
        title: appState.tripBrief.title,
        destination: appState.tripBrief.destination,
        startDate: appState.tripBrief.startDate,
        endDate: appState.tripBrief.endDate,
        stops: appState.itineraryItems.length,
        imageUrl: appState.tripBrief.image
      });
    }
    setIsShareModalOpen(true);
  };

  // Responsive adaptive screen states
  const [isLargeScreen, setIsLargeScreen] = useState<boolean>(true);
  const [activeMobileTab, setActiveMobileTab] = useState<'itinerary' | 'map' | 'copilot'>('itinerary');

  useEffect(() => {
    const checkScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Dynamic Workspace Frame Sizes
  const [leftWidth, setLeftWidth] = useState<number>(340);
  const [rightWidth, setRightWidth] = useState<number>(360);
  const [middleHeight, setMiddleHeight] = useState<number>(300);

  // Resize handler for Left Sidebar (Itinerary)
  const handleLeftDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Allow resizing between 240px and 600px
      const newWidth = Math.max(240, Math.min(600, startWidth + deltaX));
      setLeftWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('select-none', 'cursor-col-resize');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.classList.add('select-none', 'cursor-col-resize');
  };

  // Resize handler for Right Sidebar (Copilot)
  const handleRightDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging the right resize bar strictly expands towards the left (hence the minus sign)
      const deltaX = startX - moveEvent.clientX;
      // Allow resizing between 240px and 650px
      const newWidth = Math.max(240, Math.min(650, startWidth + deltaX));
      setRightWidth(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('select-none', 'cursor-col-resize');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.classList.add('select-none', 'cursor-col-resize');
  };

  // Resize handler for Center split layout (Map vs Pocket)
  const handleMiddleDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = middleHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // Allow middle map height to go from 120px up to 700px
      const newHeight = Math.max(120, Math.min(700, startHeight + deltaY));
      setMiddleHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('select-none', 'cursor-row-resize');
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.classList.add('select-none', 'cursor-row-resize');
  };

  // Computed Lookups
  const currentDay = appState.itineraryDays.find(d => d.id === appState.selectedDayId) || appState.itineraryDays[0];
  // Memoized so MapPanel/ItineraryPanel receive a stable array identity when the data is unchanged —
  // prevents the map's bounds-fit/polyline effects from re-firing on unrelated App re-renders.
  const activeDayItems = useMemo(
    () => appState.itineraryItems.filter(item => item.dayId === appState.selectedDayId),
    [appState.itineraryItems, appState.selectedDayId]
  );
  // Flattened pocket POIs for the map — memoized for the same stable-identity reason.
  const pocketMapItems = useMemo(
    () => appState.pocket.flatMap(col => col.items),
    [appState.pocket]
  );

  // Hover is kept out of appState so a mousemove over the calendar/map doesn't re-render
  // the whole trip state — only the two panels that read hoveredItemId update.
  const [hoveredItemId, setHoveredItemId] = useState<string | undefined>(undefined);

  // Handlers
  const handleSelectItem = (id: string | undefined) => {
    setAppState(prev => ({ ...prev, selectedItemId: id }));
  };

  const handleHoverItem = (id: string | undefined) => setHoveredItemId(id);

  const handleSelectDay = (id: string) => {
    setAppState(prev => ({ ...prev, selectedDayId: id }));
  };

  const handleTogglePin = (id: string) => {
    setAppState(prev => {
      const items = prev.itineraryItems.map(item => {
        if (item.id === id) {
          const nextState = item.pinState === 'soft' ? 'none' as const : 'soft' as const;
          // Log a change
          return { ...item, pinState: nextState };
        }
        return item;
      });

      const updatedItem = prev.itineraryItems.find(item => item.id === id);
      const wasPinned = updatedItem?.pinState === 'soft';

      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'pin-change',
        itemTitle: updatedItem?.title || 'Unknown Stop',
        note: wasPinned ? 'Removed soft recommendation preference.' : 'Pinned stop to lock preferred daylight position.'
      };

      return {
        ...prev,
        itineraryItems: items,
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });
  };

  const handleToggleLock = (id: string) => {
    setAppState(prev => {
      const items = prev.itineraryItems.map(item => {
        if (item.id === id) {
          const nextState = item.pinState === 'hard' ? 'none' as const : 'hard' as const;
          return { ...item, pinState: nextState };
        }
        return item;
      });

      const updatedItem = prev.itineraryItems.find(item => item.id === id);
      const wasLocked = updatedItem?.pinState === 'hard';

      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'pin-change',
        itemTitle: updatedItem?.title || 'Unknown Stop',
        note: wasLocked ? 'Removed fixed booking anchor lock.' : 'Hard locked stop in coordinates timeline to respect booking constraint.'
      };

      return {
        ...prev,
        itineraryItems: items,
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });
  };

  const triggerGoogleMapsEnrichment = async (
    itemId: string,
    title: string,
    category: string,
    targetType: 'itinerary' | 'pocket',
    columnId?: string
  ) => {
    if (!placesLib) return;
    try {
      const destination = appState.tripBrief.destination || 'Kyoto, Japan';
      const results = await placesLib.Place.searchByText({
        textQuery: `${title}, ${destination}`,
        fields: [
          'displayName',
          'formattedAddress',
          'rating',
          'userRatingCount',
          'regularOpeningHours',
          'websiteURI',
          'nationalPhoneNumber',
          'priceLevel',
          'types',
          'location',
          'editorialSummary',
          'reservable'
        ],
        maxResultCount: 1,
      });

      if (results && results.places && results.places[0]) {
        const p = results.places[0] as any;
        const latVal = p.location ? p.location.lat() : undefined;
        const lngVal = p.location ? p.location.lng() : undefined;
        
        const types = p.types || [];
        const estDuration = estimateStayDuration(title, category, types);
        const resolvedBudget = getPriceLevelBudget(p.priceLevel);
        const shortHours = p.regularOpeningHours?.weekdayDescriptions?.[0]
          ? p.regularOpeningHours.weekdayDescriptions[0].replace(/^[A-Za-z]+:\s*/, '')
          : undefined;

        // Reservable if Google states so, or is expensive food, or has other triggers
        const isReservable = p.reservable || 
          (category === 'food' && (p.priceLevel === 'PRICE_LEVEL_EXPENSIVE' || p.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE')) || 
          false;

        setAppState(prev => {
          if (targetType === 'itinerary') {
            const updatedItems = prev.itineraryItems.map(item => {
              if (item.id === itemId) {
                return {
                  ...item,
                  lat: latVal !== undefined ? latVal : item.lat,
                  lng: lngVal !== undefined ? lngVal : item.lng,
                  rating: p.rating || item.rating,
                  userRatingCount: p.userRatingCount || item.userRatingCount,
                  phoneNumber: p.nationalPhoneNumber || item.phoneNumber,
                  website: p.websiteURI || p.websiteUri || item.website,
                  reservable: isReservable,
                  editorialSummary: p.editorialSummary || item.editorialSummary,
                  formattedAddress: p.formattedAddress || item.formattedAddress,
                  estimatedDurationMin: estDuration,
                  budget: p.priceLevel ? resolvedBudget : item.budget,
                  openingHours: shortHours || item.openingHours,
                  googlePlaceFieldsLoaded: true
                };
              }
              return item;
            });
            return { ...prev, itineraryItems: updatedItems };
          } else {
            const updatedPocket = prev.pocket.map(col => {
              if (col.id === columnId) {
                const updatedColItems = col.items.map(item => {
                  if (item.id === itemId) {
                    return {
                      ...item,
                      lat: latVal !== undefined ? latVal : item.lat,
                      lng: lngVal !== undefined ? lngVal : item.lng,
                      rating: p.rating || item.rating,
                      userRatingCount: p.userRatingCount || item.userRatingCount,
                      phoneNumber: p.nationalPhoneNumber || item.phoneNumber,
                      website: p.websiteURI || p.websiteUri || item.website,
                      reservable: isReservable,
                      editorialSummary: p.editorialSummary || item.editorialSummary,
                      formattedAddress: p.formattedAddress || item.formattedAddress,
                      estimatedDurationMin: estDuration,
                      budget: p.priceLevel ? resolvedBudget : item.budget,
                      openingHours: shortHours || item.openingHours,
                      googlePlaceFieldsLoaded: true
                    };
                  }
                  return item;
                });
                return { ...col, items: updatedColItems };
              }
              return col;
            });
            return { ...prev, pocket: updatedPocket };
          }
        });
      }
    } catch (err) {
      console.warn('Enrichment failed for', title, ':', err);
    }
  };

  const handleAddItem = (partial: Partial<ItineraryItem>) => {
    const newItem: ItineraryItem = {
      id: 'place-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      dayId: appState.selectedDayId,
      title: partial.title || 'Sightseeing Stop',
      category: partial.category || 'sight',
      area: partial.area || 'Kyoto District',
      startTime: partial.startTime || '11:00 AM',
      pinState: partial.pinState || 'none',
      priority: partial.priority || 'medium',
      lat: partial.lat !== undefined ? partial.lat : undefined,
      lng: partial.lng !== undefined ? partial.lng : undefined,
    };

    setAppState(prev => {
      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'add',
        itemTitle: newItem.title,
        to: newItem.startTime,
        note: `Injected fresh activity into ${currentDay.label} schedule.`
      };

      return {
        ...prev,
        itineraryItems: [...prev.itineraryItems, newItem],
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });

    // Fire off asynchronous dynamic Google Place enrichment!
    triggerGoogleMapsEnrichment(newItem.id, newItem.title, newItem.category, 'itinerary');
  };

  const handleRemoveItem = (id: string) => {
    const itemToRemove = appState.itineraryItems.find(i => i.id === id);
    if (!itemToRemove) return;

    setAppState(prev => {
      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'drop',
        itemTitle: itemToRemove.title,
        from: itemToRemove.startTime,
        note: 'Staged out to pocket files.'
      };

      return {
        ...prev,
        itineraryItems: prev.itineraryItems.filter(item => item.id !== id),
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });
  };

  const handleAddPocketItem = (columnId: string, item: PlaceItem) => {
    setAppState(prev => {
      const updatedPocket = prev.pocket.map(col => {
        if (col.id === columnId) {
          return { ...col, items: [...col.items, item] };
        }
        return col;
      });
      return { ...prev, pocket: updatedPocket };
    });

    // Fire off asynchronous dynamic Google Place enrichment!
    triggerGoogleMapsEnrichment(item.id, item.title, item.category, 'pocket', columnId);
  };

  const handleUpdateItemTime = (itemId: string, newTime: string) => {
    const item = appState.itineraryItems.find(i => i.id === itemId);
    if (!item) return;
    const oldTime = item.startTime;

    setAppState(prev => {
      const items = prev.itineraryItems.map(i => {
        if (i.id === itemId) {
          return { ...i, startTime: newTime };
        }
        return i;
      });

      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'time-shift',
        itemTitle: item.title,
        from: oldTime || 'Flexible',
        to: newTime,
        note: `Rescheduled stop "${item.title}" from ${oldTime || 'Flexible'} to ${newTime} via timeline dragging.`
      };

      return {
        ...prev,
        itineraryItems: items,
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });
  };

  const handleDropCalendarItemToPocket = (itemId: string, targetColumnId: string) => {
    const item = appState.itineraryItems.find(i => i.id === itemId);
    if (!item) return;

    const placeItem: PlaceItem = {
      id: item.id,
      title: item.title,
      category: item.category,
      area: item.area,
      tags: [],
      subCategory: item.subCategory,
      budget: item.budget,
      openingHours: item.openingHours,
      lat: item.lat,
      lng: item.lng,
      rating: item.rating,
      userRatingCount: item.userRatingCount,
      phoneNumber: item.phoneNumber,
      website: item.website,
      reservable: item.reservable,
      editorialSummary: item.editorialSummary,
      formattedAddress: item.formattedAddress,
    };

    setAppState(prev => {
      const filteredItinerary = prev.itineraryItems.filter(i => i.id !== itemId);
      const updatedPocket = prev.pocket.map(col => {
        if (col.id === targetColumnId) {
          if (col.items.some(i => i.id === placeItem.id || i.title === placeItem.title)) {
            return col;
          }
          return {
            ...col,
            items: [...col.items, placeItem]
          };
        }
        return col;
      });

      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'drop',
        itemTitle: item.title,
        from: item.startTime,
        note: `Moved stop "${item.title}" back from schedule to Saved Research Bucket ("${targetColumnId}").`
      };

      return {
        ...prev,
        itineraryItems: filteredItinerary,
        pocket: updatedPocket,
        revisionDeltas: [newDelta, ...prev.revisionDeltas]
      };
    });
  };

  const handlePromotePocketItemToTime = (placeItem: PlaceItem, timeStr: string) => {
    const newItem: ItineraryItem = {
      ...placeItem,
      id: 'place-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      dayId: appState.selectedDayId,
      startTime: timeStr,
      pinState: 'none',
      priority: 'medium',
      lat: placeItem.lat ?? undefined,
      lng: placeItem.lng ?? undefined,
    };

    setAppState(prev => {
      const newDelta: RevisionDelta = {
        id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        type: 'add',
        itemTitle: newItem.title,
        to: newItem.startTime,
        note: `Promoted saved research element "${newItem.title}" into physical timeline at ${timeStr}.`
      };

      return {
        ...prev,
        itineraryItems: [...prev.itineraryItems, newItem],
        revisionDeltas: [newDelta, ...prev.revisionDeltas],
        pocket: prev.pocket.map(col => ({
          ...col,
          items: col.items.filter(i => i.id !== placeItem.id)
        }))
      };
    });
  };

  const handlePromotePocketItem = (placeItem: PlaceItem) => {
    // Run logistics optimizer for the selected day
    const result = optimizeSchedule(placeItem, appState.itineraryItems, appState.selectedDayId);
    setOptimizingItem(placeItem);
    setOptimizationResult(result);
  };

  const handleConfirmOptimization = (selectedChanges: ProposedChange[]) => {
    if (!optimizingItem) return;

    setAppState(prev => {
      let nextItineraryItems = [...prev.itineraryItems];

      // 1. Process REMOVALS
      const itemsToRemoveIds = selectedChanges
        .filter(c => c.type === 'remove')
        .map(c => c.itemId);
      
      nextItineraryItems = nextItineraryItems.filter(item => !itemsToRemoveIds.includes(item.id));

      // 2. Process SHIFTS
      const shiftedMap = new Map<string, string>();
      const shiftedEndMap = new Map<string, string>();
      
      selectedChanges
        .filter(c => c.type === 'shift')
        .forEach(c => {
          if (c.proposedTime) {
            shiftedMap.set(c.itemId, c.proposedTime);
            if (c.itemData.endTime) {
              shiftedEndMap.set(c.itemId, c.itemData.endTime);
            }
          }
        });

      nextItineraryItems = nextItineraryItems.map(item => {
        if (shiftedMap.has(item.id)) {
          return {
            ...item,
            startTime: shiftedMap.get(item.id)!,
            endTime: shiftedEndMap.get(item.id) || item.endTime
          };
        }
        return item;
      });

      // 3. Process INSERTION
      const insertChange = selectedChanges.find(c => c.type === 'insert');
      let createdItemId: string | undefined;
      if (insertChange) {
        createdItemId = 'place-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
        const newItemWithTime: ItineraryItem = {
          ...insertChange.itemData,
          id: createdItemId,
          dayId: prev.selectedDayId,
        };
        nextItineraryItems.push(newItemWithTime);
      }

      // Add deltas for changes
      const newDeltas: RevisionDelta[] = selectedChanges.map(c => {
        return {
          id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: c.type === 'insert' ? 'add' as const : c.type === 'remove' ? 'drop' : 'time-shift',
          itemTitle: c.itemTitle,
          from: c.originalTime,
          to: c.proposedTime,
          note: c.note
        };
      });

      // 4. Remove standard from pocket
      const nextPocket = prev.pocket.map(col => ({
        ...col,
        items: col.items.filter(i => i.id !== optimizingItem.id)
      }));

      // Fire enrichment only when an item was actually inserted
      if (insertChange && createdItemId) {
        const itemCategory = insertChange.itemData.category || 'sight';
        setTimeout(() => {
          triggerGoogleMapsEnrichment(createdItemId!, insertChange.itemTitle, itemCategory, 'itinerary');
        }, 100);
      }

      return {
        ...prev,
        itineraryItems: nextItineraryItems,
        pocket: nextPocket,
        revisionDeltas: [...newDeltas, ...prev.revisionDeltas]
      };
    });

    setOptimizingItem(null);
    setOptimizationResult(null);
  };

  const handleClearAllPocket = () => {
    setAppState(prev => ({
      ...prev,
      pocket: prev.pocket.map(col => ({ ...col, items: [] }))
    }));
  };

  const handleRemovePocketItem = (itemId: string) => {
    setAppState(prev => ({
      ...prev,
      pocket: prev.pocket.map(col => ({
        ...col,
        items: col.items.filter(i => i.id !== itemId)
      }))
    }));
  };

  const handleRevertDelta = (deltaId: string) => {
    setAppState(prev => ({
      ...prev,
      revisionDeltas: prev.revisionDeltas.filter(d => d.id !== deltaId)
    }));
  };

  const handleSendMessage = async (text: string) => {
    const freshUserMsg: CopilotMessage = {
      id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
      sender: 'user',
      text,
      timestamp: 'Just now'
    };

    setMessages(prev => [...prev, freshUserMsg]);

    // Quick command: "regenerate" / "re-plan" → re-plan from the Research Pocket (keepAll),
    // keeping fixed bookings/pins in place. Handled client-side; no API round-trip. (#23)
    if (/\b(regenerate|re-?plan|rebuild (the )?(plan|trip|itinerary))\b/i.test(text)) {
      handleRegenerate();
      setMessages(prev => [...prev, {
        id: 'ai-regen-' + Date.now(),
        sender: 'ai',
        text: 'Re-planned your trip from the Research Pocket — booked and pinned stops stayed exactly where they were, everything else re-timed around them, and anything that no longer fit went back to your pocket.',
        timestamp: 'Just now',
      }]);
      return;
    }

    setIsCopilotLoading(true);

    try {
      // Call server proxy first
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          appState
        })
      });

      if (res.ok) {
        const payload = await res.json();
        const freshAIMsg: CopilotMessage = {
          id: 'ai-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          sender: 'ai',
          text: payload.message,
          timestamp: 'Just now',
          suggestion: payload.suggestion || undefined
        };

        setMessages(prev => [...prev, freshAIMsg]);

        // A pasted confirmation surfaces parsed bookings — commit them immediately as locked
        // anchors via applyBookings (#17/#20). Cancellations unlock + flag a re-plan.
        if (Array.isArray(payload.bookings) && payload.bookings.length) {
          setAppState(prev => {
            const r = applyBookings(
              { bookings: prev.bookings, itineraryItems: prev.itineraryItems, days: prev.itineraryDays, tripStartDate: prev.tripBrief.startDate },
              payload.bookings
            );
            return { ...prev, bookings: r.bookings, itineraryItems: r.itineraryItems, revisionDeltas: [...r.deltas, ...prev.revisionDeltas] };
          });
        }

        // Itinerary/pocket edits are STAGED (not auto-applied) so the user can review them in the
        // copilot's tiered "Apply changes / removal" card (#27) and confirm via onApplyChange.
        if (payload.updatedItems || payload.updatedPocket || (payload.deltas && payload.deltas.length)) {
          setPendingChanges(prev => ({
            ...prev,
            [freshAIMsg.id]: { base: appState.itineraryItems, updatedItems: payload.updatedItems, updatedPocket: payload.updatedPocket, deltas: payload.deltas },
          }));
        }
      } else {
        throw new Error('API server failed');
      }
    } catch (err) {
      // Graceful local smart fallback
      const fallback = getLocalCopilotResponse(text, appState.itineraryDays, appState.itineraryItems);
      const freshAIMsg: CopilotMessage = {
        id: 'ai-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
        sender: 'ai',
        text: fallback.message,
        timestamp: 'Just now',
      };

      setMessages(prev => [...prev, freshAIMsg]);

      if (fallback.updatedItems) {
        setAppState(prev => {
          const nextState = {
            ...prev,
            itineraryItems: fallback.updatedItems!
          };
          if (fallback.deltas) {
            nextState.revisionDeltas = [...fallback.deltas, ...prev.revisionDeltas];
          }
          return nextState;
        });
      }
    } finally {
      setIsCopilotLoading(false);
    }
  };

  // Apply a STAGED copilot change set (#27 tiered apply): commit the proposed items/pocket/deltas,
  // then clear it so the card collapses. (Applies the snapshot captured when the reply arrived.)
  // 3-way merge a staged copilot proposal onto the LIVE board so applying a stale card never clobbers
  // edits made after the reply. `base` = board the copilot diffed from; only the items it actually
  // changed/added/removed are applied — anything the user touched in between is preserved.
  const mergeProposedItinerary = (base: ItineraryItem[] | undefined, proposed: ItineraryItem[], current: ItineraryItem[]): ItineraryItem[] => {
    if (!base) return proposed; // no base captured (legacy entry) → fall back to wholesale replace
    const mapOf = (arr: ItineraryItem[]) => new Map(arr.filter(x => x.id).map(x => [x.id as string, x]));
    const baseMap = mapOf(base), propMap = mapOf(proposed);
    const removed = new Set([...baseMap.keys()].filter(k => !propMap.has(k)));   // copilot dropped these
    const result = current.filter(it => !it.id || !removed.has(it.id));         // live board minus removals
    for (const [k, p] of propMap) {
      const b = baseMap.get(k);
      if (b && JSON.stringify(b) === JSON.stringify(p)) continue;               // copilot didn't touch it → keep live version
      const idx = result.findIndex(it => it.id === k);
      if (idx >= 0) result[idx] = p; else result.push(p);                       // apply copilot's edit / add
    }
    return result;
  };

  const handleApplyChange = (msgId: string) => {
    const pc = pendingChanges[msgId];
    if (!pc) return;
    setAppState(prev => {
      const next: AppState = { ...prev };
      if (pc.updatedItems) next.itineraryItems = mergeProposedItinerary(pc.base, pc.updatedItems as ItineraryItem[], prev.itineraryItems);
      if (pc.updatedPocket) next.pocket = pc.updatedPocket as any;
      if (pc.deltas && pc.deltas.length) next.revisionDeltas = [...pc.deltas, ...prev.revisionDeltas];
      return next;
    });
    setPendingChanges(prev => { const n = { ...prev }; delete n[msgId]; return n; });
  };

  // Regenerate the trip from the current board + fresh Research Pocket, keeping locked/pinned items
  // byte-for-byte (regenerateFromPocket → keepAll); overflow returns to the pocket. (#23)
  const handleRegenerate = () => {
    setAppState(prev => {
      const res = regenerateFromPocket({
        board: prev.itineraryItems as any,
        pocket: prev.pocket,
        dayIds: prev.itineraryDays.map(d => d.id),
        brief: { style: prev.tripBrief.style },
      });
      const scheduled = res.itineraryItems as unknown as ItineraryItem[];
      const scheduledIds = new Set(scheduled.map(i => i.id));
      // Overflow → back into the pocket columns by category; never wipe un-scheduled saved items.
      const nextPocket = prev.pocket.map(col => {
        const overflowForCol = res.pocket.filter((p: any) =>
          (col.id === 'food-drink' ? p.category === 'food' : p.category !== 'food') && !scheduledIds.has(p.id));
        const kept = col.items.filter(p => !scheduledIds.has(p.id));
        const added = overflowForCol.filter((p: any) => !kept.some(e => e.id === p.id));
        return { ...col, items: [...kept, ...added] as PlaceItem[] };
      });
      const fixed = scheduled.filter(i => (i as any).pinState === 'hard' || (i as any).reservationBound).length;
      const delta: RevisionDelta = {
        id: 'delta-regen-' + Date.now(),
        type: 'move',
        itemTitle: `Regenerated ${prev.itineraryDays.length}-day plan`,
        note: `Re-planned around ${fixed} fixed item(s); ${res.pocket.length} returned to pocket.`,
      };
      return { ...prev, itineraryItems: scheduled, pocket: nextPocket, revisionDeltas: [delta, ...prev.revisionDeltas] };
    });
  };

  const handleApplySug = (msgId: string) => {
    const parentMsg = messages.find(m => m.id === msgId);
    if (!parentMsg || !parentMsg.suggestion) return;

    const sug = parentMsg.suggestion;

    if (sug.itemsToAdd && sug.itemsToAdd.length > 0) {
      setAppState(prev => {
        const nextPocket = prev.pocket.map(col => {
          const itemsForThisCol = sug.itemsToAdd!.filter(item => {
            const isFood = item.category === 'food';
            if (col.id === 'food-drink') return isFood;
            if (col.id === 'must-see') return !isFood;
            return false;
          });

          if (itemsForThisCol.length === 0) return col;

          const filterDuplicates = itemsForThisCol.filter(
            newItem => !col.items.some(existing => existing.title === newItem.title || existing.id === newItem.id)
          );

          return {
            ...col,
            items: [...col.items, ...filterDuplicates]
          };
        });

        const itemTitlesStr = sug.itemsToAdd!.map(i => i.title).join(', ');
        const newDelta: RevisionDelta = {
          id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: 'add',
          itemTitle: itemTitlesStr,
          note: `Imported recommendations into research manager.`
        };

        return {
          ...prev,
          pocket: nextPocket,
          revisionDeltas: [newDelta, ...prev.revisionDeltas]
        };
      });

      sug.itemsToAdd.forEach(item => {
        const columnId = item.category === 'food' ? 'food-drink' : 'must-see';
         triggerGoogleMapsEnrichment(item.id, item.title, item.category, 'pocket', columnId);
      });

      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, suggestion: undefined } : m))
      );
      return;
    }

    if (sug.type === 'Conflict Alert' && sug.timeShift) {
      // Match by current startTime so this works for any trip, not just Kyoto
      setAppState(prev => {
        const conflictedItem = prev.itineraryItems.find(
          item => item.startTime === sug.timeShift!.from
        );
        const items = prev.itineraryItems.map(item => {
          if (item.startTime === sug.timeShift!.from) {
            return {
              ...item,
              startTime: sug.timeShift!.to,
              note: 'Confirmed (Shifted to minimize crowds)'
            };
          }
          return item;
        });

        const newDelta: RevisionDelta = {
          id: 'delta-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
          type: 'time-shift',
          itemTitle: conflictedItem?.title || sug.title,
          from: sug.timeShift!.from,
          to: sug.timeShift!.to,
          note: 'Shifted conflicting slot to avoid overcrowding.'
        };

        return {
          ...prev,
          itineraryItems: items,
          revisionDeltas: [newDelta, ...prev.revisionDeltas]
        };
      });

      // Erase suggestion so it cannot be double clicked
      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, suggestion: undefined } : m))
      );
    } else if (sug.type === 'Smart Add') {
      const placeToSchedule: PlaceItem = {
        id: 'place-sug-' + Date.now(),
        title: sug.title || 'Traditional Tea Ceremony',
        category: 'sight',
        area: 'Fushimi Gion',
        subCategory: 'Cultural Ceremony',
        budget: '¥3,800',
        openingHours: '10:00 AM - 6:00 PM',
        lat: 34.9963, // coordinate near Fushimi Gion
        lng: 135.7722,
        estimatedDurationMin: 90
      };

      const result = optimizeSchedule(placeToSchedule, appState.itineraryItems, appState.selectedDayId);
      setOptimizingItem(placeToSchedule);
      setOptimizationResult(result);

      setMessages(prev =>
        prev.map(m => (m.id === msgId ? { ...m, suggestion: undefined } : m))
      );
    }
  };

  const handleApplyPreset = (command: string) => {
    handleSendMessage(command);
  };

  // Switch the active trip to an authored dataset (Kyoto, Iceland, …) and open the planner.
  // Pocket is rehydrated per-trip from storage, falling back to the trip's seed pocket.
  const handleLoadTrip = (tripId: string) => {
    const t = getTrip(tripId);
    if (!t) {
      setAppState(prev => ({ ...prev, currentView: 'plan' }));
      return;
    }
    setAppState(prev => ({
      ...prev,
      tripBrief: t.tripBrief,
      itineraryDays: t.itineraryDays,
      itineraryItems: t.itineraryItems,
      pocket: loadJSON(pocketKey(t.tripBrief.id), t.pocket),
      bookings: t.bookings,
      revisionDeltas: t.revisionDeltas,
      selectedItemId: undefined,
      selectedDayId: t.itineraryDays[0]?.id ?? prev.selectedDayId,
      currentView: 'plan',
    }));
    setMessages(t.messages);
  };

  return (
    <div className="w-full h-screen font-sans flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
        {/* Upper Navigation Rail */}
        <TopHeader
          onToggleViewSheet={() => setShowComponentSheet(prev => !prev)}
          showComponentSheet={showComponentSheet}
          currentView={appState.currentView}
          onViewChange={(view) => setAppState(prev => ({ ...prev, currentView: view }))}
          pool={placeItemsToPool(appState.pocket, { scheduledIds: appState.itineraryItems.map(i => i.id) })}
          onGenerated={handleGenerated}
          onLoadTrip={handleLoadTrip}
          tripBrief={appState.tripBrief}
          onRegenerate={handleRegenerate}
          onStartOver={handleStartOver}
          lastRevisedAt={lastRevisedAt}
        />

        {/* Adaptive Mobile Workspace Navigation Tab bar */}
        {!isLargeScreen && (
          <div className="flex border-b border-border-subtle bg-white p-2.5 gap-2 shrink-0 shadow-sm z-10">
            <button
              onClick={() => setActiveMobileTab('itinerary')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeMobileTab === 'itinerary'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Itinerary
            </button>
            <button
              onClick={() => setActiveMobileTab('map')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeMobileTab === 'map'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              Map & Research
            </button>
            <button
              onClick={() => setActiveMobileTab('copilot')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeMobileTab === 'copilot'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              Copilot Chat
            </button>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 w-full flex overflow-hidden p-2 gap-0 relative">
          {appState.currentView === 'trips' ? (
            <div className="absolute inset-0 z-20 bg-background p-2 animate-fadeIn">
              <TripsPage
                currentTrip={appState.tripBrief}
                onViewChange={(view) => setAppState(prev => ({ ...prev, currentView: view }))}
                onShare={handleOpenShare}
                onLoadTrip={handleLoadTrip}
              />
            </div>
          ) : appState.currentView === 'explore' ? (
            <div className="absolute inset-0 z-20 bg-background p-2 animate-fadeIn">
              <ExplorePage
                onViewChange={(view) => setAppState(prev => ({ ...prev, currentView: view }))}
              />
            </div>
          ) : appState.currentView === 'pocket' ? (
            <div className="absolute inset-0 z-20 bg-background p-2 animate-fadeIn">
              <PocketBoardPage
                pocket={appState.pocket}
                selectedItemId={appState.selectedItemId}
                onSelectItem={handleSelectItem}
                onAddPocketItem={handleAddPocketItem}
                onPromoteItem={handlePromotePocketItem}
                onClearAll={handleClearAllPocket}
                onRemovePocketItem={handleRemovePocketItem}
                onAskCopilot={() => setAppState(prev => ({ ...prev, currentView: 'plan' }))}
              />
            </div>
          ) : (
            <>
              {/* Toggleable sidebar depending on layout selection */}
              {viewType === 'day' ? (
            <div 
              style={{ width: isLargeScreen ? `${leftWidth}px` : '100%' }} 
              className={`shrink-0 h-full flex flex-col overflow-hidden ${
                isLargeScreen ? 'lg:flex' : activeMobileTab === 'itinerary' ? 'flex' : 'hidden'
              }`}
            >
              <ItineraryPanel
                currentDay={currentDay}
                days={appState.itineraryDays}
                items={appState.itineraryItems}
                selectedItemId={appState.selectedItemId}
                hoveredItemId={hoveredItemId}
                viewType={viewType}
                focusMode={focusMode}
                onSelectItem={handleSelectItem}
                onHoverItem={handleHoverItem}
                onSelectDay={handleSelectDay}
                onTogglePin={handleTogglePin}
                onToggleLock={handleToggleLock}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                onSetViewType={setViewType}
                onUpdateItemTime={handleUpdateItemTime}
                onPromotePocketItemToTime={handlePromotePocketItemToTime}
                onShare={() => handleOpenShare()}
              />
            </div>
          ) : (
            <div 
              className={`flex-1 overflow-hidden h-full ${
                isLargeScreen ? 'flex' : activeMobileTab === 'itinerary' ? 'flex' : 'hidden'
              }`}
            >
              <ItineraryPanel
                currentDay={currentDay}
                days={appState.itineraryDays}
                items={appState.itineraryItems}
                selectedItemId={appState.selectedItemId}
                hoveredItemId={hoveredItemId}
                viewType={viewType}
                focusMode={focusMode}
                onSelectItem={handleSelectItem}
                onHoverItem={handleHoverItem}
                onSelectDay={handleSelectDay}
                onTogglePin={handleTogglePin}
                onToggleLock={handleToggleLock}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                onSetViewType={setViewType}
                onUpdateItemTime={handleUpdateItemTime}
                onPromotePocketItemToTime={handlePromotePocketItemToTime}
                onShare={() => handleOpenShare()}
              />
            </div>
          )}

          {/* Left Resizer Drag Handle */}
          {viewType === 'day' && isLargeScreen && (
            <div
              onMouseDown={handleLeftDrag}
              onDoubleClick={() => setLeftWidth(360)}
              className="w-3 hover:w-4 flex items-center justify-center cursor-col-resize group self-stretch select-none shrink-0 transition-all"
              title="Drag to resize sidebar (Double click to reset)"
            >
              <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
            </div>
          )}

          {/* Center Canvas Pane (Toggles Focus Mode / Map or Normal Grid) */}
          {viewType === 'day' && (
            <div 
              className={`flex-1 flex flex-col overflow-hidden h-full ${
                isLargeScreen ? 'flex' : activeMobileTab === 'map' ? 'flex' : 'hidden'
              }`}
            >
              {focusMode ? (
                <FocusModeSplash
                  onRestoreMap={() => setFocusMode(false)}
                  onAskCopilot={() => handleApplyPreset('Reduce transit')}
                />
              ) : (
                <>
                  {/* Upper Map Panel with focus/minimize button details */}
                  <div 
                    style={{ height: `${middleHeight}px` }} 
                    className="shrink-0 relative group overflow-hidden flex flex-col"
                  >
                    <MapPanel
                      items={activeDayItems}
                      selectedItemId={appState.selectedItemId}
                      hoveredItemId={hoveredItemId}
                      onSelectItem={handleSelectItem}
                      onHoverItem={handleHoverItem}
                      pocketItems={pocketMapItems}
                    />
                  </div>

                  {/* Horizontal Resizer Drag Handle */}
                  <div
                    onMouseDown={handleMiddleDrag}
                    onDoubleClick={() => setMiddleHeight(350)}
                    className="h-3 hover:h-4 flex items-center justify-center cursor-row-resize group w-full select-none shrink-0 transition-all"
                    title="Drag to resize map (Double click to reset)"
                  >
                    <div className="h-1 w-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
                  </div>

                  {/* Lower Research Pocket Shelf */}
                  <PocketPanel
                    pocket={appState.pocket}
                    onAddPocketItem={handleAddPocketItem}
                    onPromoteItem={handlePromotePocketItem}
                    onClearAll={handleClearAllPocket}
                    onRemovePocketItem={handleRemovePocketItem}
                    selectedItemId={appState.selectedItemId}
                    onSelectItem={handleSelectItem}
                    onDropCalendarItem={handleDropCalendarItemToPocket}
                    focusedDayItems={activeDayItems}
                    focusedDayArea={currentDay?.areaSummary}
                    focusedDayLabel={currentDay ? `${currentDay.label} ${currentDay.date}` : undefined}
                  />
                </>
              )}
            </div>
          )}

          {/* Right Resizer Drag Handle */}
          {viewType === 'day' && isLargeScreen && (
            <div
              onMouseDown={handleRightDrag}
              onDoubleClick={() => setRightWidth(380)}
              className="w-3 hover:w-4 flex items-center justify-center cursor-col-resize group self-stretch select-none shrink-0 transition-all"
              title="Drag to resize sidebar (Double click to reset)"
            >
              <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
            </div>
          )}

          {/* Right Travel Copilot Sidebar Panel */}
          <div 
            style={{ width: isLargeScreen ? `${rightWidth}px` : '100%' }} 
            className={`shrink-0 h-full flex flex-col overflow-hidden ${
              isLargeScreen ? 'lg:flex' : activeMobileTab === 'copilot' ? 'flex' : 'hidden'
            }`}
          >
            <CopilotPanel
              messages={messages}
              deltas={appState.revisionDeltas}
              onSendMessage={handleSendMessage}
              onApplyPreset={handleApplyPreset}
              onRevertDelta={handleRevertDelta}
              onApplySug={handleApplySug}
              pendingChanges={pendingChanges}
              onApplyChange={handleApplyChange}
            />
          </div>
          </>
          )}
        </main>

        {/* Floating System State Inspector Shelf */}
        {showComponentSheet && (
          <div className="p-4 bg-background border-t border-border-subtle shrink-0">
            <SourceOfTruthSheet appState={appState} hasApi={true} />
          </div>
        )}

        {/* Dynamic Optimization Confirmation Dialog */}
        {optimizingItem && optimizationResult && (
          <OptimizeScheduleModal
            isOpen={true}
            onClose={() => {
              setOptimizingItem(null);
              setOptimizationResult(null);
            }}
            newItem={optimizingItem}
            dayName={appState.itineraryDays.find(d => d.id === appState.selectedDayId)?.fullDateString || appState.itineraryDays.find(d => d.id === appState.selectedDayId)?.label || 'Selected Day'}
            optimization={optimizationResult}
            onConfirm={handleConfirmOptimization}
          />
        )}

        <ShareModal 
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          tripData={shareTripData || {
            title: '',
            destination: '',
            startDate: '',
            endDate: '',
            stops: 0,
            imageUrl: ''
          }}
        />
      </div>
  );
}

function estimateStayDuration(title: string, category: string, types?: string[]): number {
  const lowercaseTitle = title.toLowerCase();
  
  if (lowercaseTitle.includes('gion') || lowercaseTitle.includes('pontocho')) return 90;
  if (lowercaseTitle.includes('kinkaku') || lowercaseTitle.includes('ginkaku')) return 60;
  if (lowercaseTitle.includes('fushimi') || lowercaseTitle.includes('inari')) return 120;
  if (lowercaseTitle.includes('bamboo') || lowercaseTitle.includes('arashiyama')) return 90;
  if (lowercaseTitle.includes('castle') || lowercaseTitle.includes('nijo')) return 120;
  if (lowercaseTitle.includes('kiyomizu')) return 90;
  if (lowercaseTitle.includes('nishiki') || lowercaseTitle.includes('market')) return 90;
  
  if (types && types.length > 0) {
    if (types.includes('amusement_park') || types.includes('museum') || types.includes('art_gallery') || types.includes('zoo')) {
      return 120; // 2 hrs suggested average
    }
    if (types.includes('temple') || types.includes('shrine') || types.includes('church') || types.includes('mosque') || types.includes('place_of_worship')) {
      return 60; // 1 hr is custom/typical stay
    }
    if (types.includes('park') || types.includes('botanical_garden') || types.includes('nature_reserve') || types.includes('tourist_attraction')) {
      return 90; // 1.5 hrs
    }
    if (types.includes('shopping_mall') || types.includes('department_store')) {
      return 90; // 1.5 hrs
    }
    if (types.includes('restaurant') || types.includes('bar') || types.includes('night_club') || types.includes('food')) {
      return 60; // 1 hr default dining
    }
    if (types.includes('cafe') || types.includes('bakery')) {
      return 30; // 30 mins default coffee stop
    }
    if (types.includes('lodging') || types.includes('hotel')) {
      return 60;
    }
  }
  
  // Basic backup based on category
  if (category === 'food') return 60;
  if (category === 'sight') return 90;
  if (category === 'stay') return 60;
  if (category === 'transit') return 15;
  return 60;
}

function getPriceLevelBudget(priceLevel: string | undefined): string {
  if (!priceLevel) return '$$';
  if (priceLevel.includes('INEXPENSIVE') || priceLevel.includes('LOW')) return '¥';
  if (priceLevel.includes('MODERATE') || priceLevel.includes('MEDIUM')) return '¥¥';
  if (priceLevel.includes('EXPENSIVE') || priceLevel.includes('HIGH')) return '¥¥¥';
  if (priceLevel.includes('VERY_EXPENSIVE')) return '¥¥¥¥';
  return '$$';
}

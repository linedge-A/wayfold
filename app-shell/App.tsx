/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ... (keep initial comments)
import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Sparkles, Map, Bot, Compass, Plus, ShieldAlert, Calendar, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
// ...
import TopHeader from './TopHeader';
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
import ShareModal from './ShareModal';
import { AppState, CopilotMessage, PlaceItem, ItineraryItem, RevisionDelta, PocketColumn } from '@/shared/types/index';
import { fetchPlaceSnapshot } from '@/shared/utils/placesCache';
import { INITIAL_TRIP_BRIEF, INITIAL_DAYS, INITIAL_ITINERARY_ITEMS, INITIAL_POCKET, INITIAL_BOOKINGS, INITIAL_REVISION_DELTAS, INITIAL_MESSAGES } from '@/shared/mock-data/seedData';
import { getLocalCopilotResponse } from '@/modules/copilot/localResponses';

// Safely resolve the Google Maps API Key from multiple potential environment sources
const API_KEY = (
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  ''
).trim();

// Check if the key looks like a real key and not a placeholder or empty
const IS_VALID_KEY = Boolean(API_KEY) && 
                    API_KEY !== 'YOUR_API_KEY' && 
                    API_KEY.length > 10;

// Simple Error Boundary to catch generic "Script error." and runtime failures
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto">
            The application encountered an unexpected error. This can sometimes happen due to script loading failures or API quota limits.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-md hover:opacity-90 transition-all cursor-pointer"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
    pocket: INITIAL_POCKET,
    bookings: INITIAL_BOOKINGS,
    selectedDayId: 'day-3', // Default to Wednesday 14th to match premium screenshot
    selectedItemId: undefined,
    revisionDeltas: INITIAL_REVISION_DELTAS,
    currentView: 'plan'
  });

  const [viewType, setViewType] = useState<'day' | 'week' | 'month' | 'agenda'>('day');
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [showComponentSheet, setShowComponentSheet] = useState<boolean>(false);
  const [messages, setMessages] = useState<CopilotMessage[]>(INITIAL_MESSAGES);
  const [isCopilotLoading, setIsCopilotLoading] = useState<boolean>(false);

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
  const [isTablet, setIsTablet] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'itinerary' | 'map' | 'copilot'>('itinerary');

  useEffect(() => {
    const checkScreenSize = () => {
      const w = window.innerWidth;
      setIsLargeScreen(w >= 1024);
      setIsTablet(w >= 768 && w < 1024);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // "Read mode" (tripMode) = read-only consumption: folds Chat + Bucket so only Itinerary + Map remain.
  // Desktop uses one foldable H-layout; tablet keeps its own side-by-side; phone keeps its tabs.
  const [tripMode, setTripMode] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [pocketCollapsed, setPocketCollapsed] = useState(false);
  const consumptionMode = isTablet;
  const readOnly = !isLargeScreen || tripMode;

  // Navigating via the top nav always leaves read mode (returns to normal editing/browsing).
  const handleViewChange = (view: 'plan' | 'trips' | 'explore') => {
    setTripMode(false);
    setChatCollapsed(false);
    setPocketCollapsed(false);
    setAppState(prev => ({ ...prev, currentView: view }));
  };
  // Opening a specific trip from the Trips page enters read mode (folds Chat + Bucket) on the plan canvas.
  const handleOpenTrip = () => {
    setTripMode(true);
    setChatCollapsed(true);
    setPocketCollapsed(true);
    setAppState(prev => ({ ...prev, currentView: 'plan' }));
  };
  // Edit ⇄ Read toggle from the itinerary header: read folds Chat + Bucket and locks editing.
  const handleToggleReadMode = () => {
    setTripMode(prev => {
      const next = !prev;
      setChatCollapsed(next);
      setPocketCollapsed(next);
      return next;
    });
  };

  // Schedule changes from the copilot are STAGED (not auto-applied) and require an explicit
  // colour-coded confirm in chat (blue=add, orange=shift, red=remove).
  const [pendingChanges, setPendingChanges] = useState<Record<string, { updatedItems?: ItineraryItem[]; updatedPocket?: PocketColumn[]; deltas?: RevisionDelta[] }>>({});
  const handleApplyChange = (msgId: string) => {
    const pc = pendingChanges[msgId];
    if (!pc) return;
    setAppState(prev => ({
      ...prev,
      ...(pc.updatedItems && { itineraryItems: pc.updatedItems }),
      ...(pc.updatedPocket && { pocket: pc.updatedPocket }),
      ...(pc.deltas && { revisionDeltas: [...pc.deltas, ...prev.revisionDeltas] }),
    }));
    setPendingChanges(prev => { const n = { ...prev }; delete n[msgId]; return n; });
  };

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
  // Cap the map height to the actual centre-pane height so the bucket list (min 160px)
  // always stays visible at the bottom instead of being pushed below the fold. Shared by
  // both the drag and the double-click reset so neither can overshoot.
  const maxMapHeightFor = (resizerEl: HTMLElement | null): number => {
    const pane = resizerEl?.parentElement?.parentElement;
    const paneHeight = pane ? pane.getBoundingClientRect().height : (window.innerHeight - 160);
    const POCKET_RESERVE = 176; // pocket min-height (160) + resizer + gap
    return Math.max(160, paneHeight - POCKET_RESERVE);
  };

  const handleMiddleDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = middleHeight;
    const maxMapHeight = maxMapHeightFor(e.currentTarget as HTMLElement);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(120, Math.min(maxMapHeight, startHeight + deltaY));
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
  const activeDayItems = appState.itineraryItems.filter(item => item.dayId === appState.selectedDayId);

  // Handlers
  const handleSelectItem = (id: string | undefined) => {
    setAppState(prev => ({ ...prev, selectedItemId: id }));
  };

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
      // Shared cache (memory + localStorage): one Places Text Search per place, ever.
      const p = await fetchPlaceSnapshot(placesLib, `${title}, ${destination}`);

      if (p) {
        const latVal = p.lat;
        const lngVal = p.lng;

        const types = p.types || [];
        const estDuration = estimateStayDuration(title, category, types);
        const resolvedBudget = getPriceLevelBudget(p.priceLevel);
        const shortHours = p.todayHours
          ? p.todayHours.replace(/^[A-Za-z]+:\s*/, '')
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
                  website: p.websiteUri || item.website,
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
                      website: p.websiteUri || item.website,
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

        // Stage schedule changes for an explicit confirm in chat (no silent auto-apply).
        if (payload.updatedItems || payload.updatedPocket || payload.deltas) {
          setPendingChanges(prev => ({
            ...prev,
            [freshAIMsg.id]: {
              updatedItems: payload.updatedItems,
              updatedPocket: payload.updatedPocket,
              deltas: payload.deltas,
            },
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

      if (fallback.updatedItems || fallback.deltas) {
        setPendingChanges(prev => ({
          ...prev,
          [freshAIMsg.id]: {
            updatedItems: fallback.updatedItems,
            deltas: fallback.deltas,
          },
        }));
      }
    } finally {
      setIsCopilotLoading(false);
    }
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

  return (
    <div className="w-full h-screen font-sans flex flex-col bg-background selection:bg-primary/20 selection:text-primary">
        {/* Upper Navigation Rail */}
        <TopHeader
          onToggleViewSheet={() => setShowComponentSheet(prev => !prev)}
          showComponentSheet={showComponentSheet}
          currentView={appState.currentView}
          onViewChange={handleViewChange}
          currentTrip={appState.tripBrief}
        />

        {/* Phone-only compact workspace switch bar (tablet uses a side-by-side layout instead) */}
        {!isLargeScreen && !isTablet && appState.currentView === 'plan' && (
          <div className="flex border-b border-border-subtle bg-white px-2 py-1.5 gap-1.5 shrink-0 shadow-sm z-10">
            <button
              onClick={() => setActiveMobileTab('itinerary')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeMobileTab === 'itinerary'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Calendar className="w-3 h-3" />
              Itinerary
            </button>
            <button
              onClick={() => setActiveMobileTab('map')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeMobileTab === 'map'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Map className="w-3 h-3" />
              Map
            </button>
            <button
              onClick={() => setActiveMobileTab('copilot')}
              className={`flex-1 py-1 text-[11px] font-semibold rounded-md flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeMobileTab === 'copilot'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-secondary hover:text-primary'
              }`}
            >
              <Bot className="w-3 h-3" />
              Copilot
            </button>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 w-full flex overflow-hidden p-2 gap-0 relative">
          {appState.currentView === 'trips' ? (
            <div className="absolute inset-0 z-20 bg-background p-2 animate-fadeIn">
              <TripsPage
                currentTrip={appState.tripBrief}
                stopCount={appState.itineraryItems.length}
                onViewChange={handleViewChange}
                onOpenTrip={handleOpenTrip}
                onShare={handleOpenShare}
              />
            </div>
          ) : appState.currentView === 'explore' ? (
            <div className="absolute inset-0 z-20 bg-background p-2 animate-fadeIn">
              <ExplorePage
                onViewChange={handleViewChange}
              />
            </div>
          ) : consumptionMode ? (
            <>
              {/* Trip-mode indicator + edit affordance (desktop trip view) */}
              {isLargeScreen && tripMode && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-white border border-border-subtle rounded-full shadow-md px-3.5 py-1.5">
                  <span className="text-[11px] font-bold text-on-surface flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Trip view · read-only
                  </span>
                  <button
                    onClick={() => handleViewChange('plan')}
                    className="text-[11px] font-bold text-primary hover:bg-primary-soft px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                  >
                    Edit plan
                  </button>
                </div>
              )}

              {/* "On the road" consumption: itinerary + map side-by-side, read-only */}
              <div className="w-[45%] min-w-[300px] h-full overflow-hidden shrink-0">
                <ItineraryPanel
                  currentDay={currentDay}
                  days={appState.itineraryDays}
                  items={appState.itineraryItems}
                  selectedItemId={appState.selectedItemId}
                  viewType={viewType}
                  focusMode={focusMode}
                  readOnly
                  onSelectItem={handleSelectItem}
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
              <div className="flex-1 h-full overflow-hidden pl-2">
                <MapPanel
                  items={activeDayItems}
                  selectedItemId={appState.selectedItemId}
                  onSelectItem={handleSelectItem}
                  pocketItems={appState.pocket.flatMap(col => col.items)}
                />
              </div>
            </>
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
                viewType={viewType}
                focusMode={focusMode}
                readOnly={readOnly}
                onToggleReadMode={isLargeScreen ? handleToggleReadMode : undefined}
                onSelectItem={handleSelectItem}
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
                viewType={viewType}
                focusMode={focusMode}
                readOnly={readOnly}
                onToggleReadMode={isLargeScreen ? handleToggleReadMode : undefined}
                onSelectItem={handleSelectItem}
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
                  {/* Map — fills the center when the Bucket list is folded */}
                  <div
                    style={{ height: (isLargeScreen && pocketCollapsed) ? undefined : `${middleHeight}px` }}
                    className={`relative group overflow-hidden flex flex-col ${(isLargeScreen && pocketCollapsed) ? 'flex-1' : 'shrink-0'}`}
                  >
                    <MapPanel
                      items={activeDayItems}
                      selectedItemId={appState.selectedItemId}
                      onSelectItem={handleSelectItem}
                      pocketItems={appState.pocket.flatMap(col => col.items)}
                    />
                  </div>

                  {isLargeScreen && pocketCollapsed ? (
                    /* Folded Bucket list — handle to re-expand */
                    <button
                      onClick={() => setPocketCollapsed(false)}
                      className="shrink-0 mt-1 h-7 flex items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-white hover:bg-surface-container-low text-[11px] font-bold text-secondary hover:text-primary transition-colors cursor-pointer"
                      title="Show bucket list"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                      Bucket list
                      <span className="text-[9px] text-tertiary font-bold">{appState.pocket.reduce((n, c) => n + c.items.length, 0)}</span>
                    </button>
                  ) : (
                    <>
                      {/* Horizontal Resizer + fold control */}
                      <div className="flex items-center w-full shrink-0">
                        <div
                          onMouseDown={handleMiddleDrag}
                          onDoubleClick={(e) => setMiddleHeight(Math.min(350, maxMapHeightFor(e.currentTarget as HTMLElement)))}
                          className="h-3 hover:h-4 flex-1 flex items-center justify-center cursor-row-resize group select-none transition-all"
                          title="Drag to resize map (Double click to reset)"
                        >
                          <div className="h-1 w-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
                        </div>
                        {isLargeScreen && (
                          <button
                            onClick={() => setPocketCollapsed(true)}
                            className="p-1 text-slate-300 hover:text-primary hover:bg-surface-container-low rounded transition-colors cursor-pointer shrink-0"
                            title="Hide bucket list"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                      />
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Right side: Copilot chat — collapsible on desktop, tabbed on phone */}
          {isLargeScreen ? (
            chatCollapsed ? (
              /* Folded chat — handle to re-expand */
              <button
                onClick={() => setChatCollapsed(false)}
                className="shrink-0 w-7 ml-1 self-stretch flex flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle bg-white hover:bg-surface-container-low text-secondary hover:text-primary transition-colors cursor-pointer"
                title="Show Copilot chat"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[10px] font-bold tracking-wide" style={{ writingMode: 'vertical-rl' }}>Copilot</span>
              </button>
            ) : (
              <>
                {/* Collapse control + drag resizer */}
                <div className="flex flex-col items-center self-stretch shrink-0 py-1">
                  <button
                    onClick={() => setChatCollapsed(true)}
                    className="p-1 text-slate-300 hover:text-primary hover:bg-surface-container-low rounded transition-colors cursor-pointer"
                    title="Hide Copilot chat"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {viewType === 'day' && (
                    <div
                      onMouseDown={handleRightDrag}
                      onDoubleClick={() => setRightWidth(380)}
                      className="w-3 hover:w-4 flex-1 flex items-center justify-center cursor-col-resize group select-none transition-all"
                      title="Drag to resize sidebar (Double click to reset)"
                    >
                      <div className="w-1 h-12 rounded-full bg-slate-200 group-hover:bg-primary/50 group-active:bg-primary transition-all pointer-events-none" />
                    </div>
                  )}
                </div>
                <div style={{ width: `${rightWidth}px` }} className="shrink-0 h-full flex flex-col overflow-hidden">
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
            )
          ) : (
            <div className={`shrink-0 h-full w-full flex-col overflow-hidden ${activeMobileTab === 'copilot' ? 'flex' : 'hidden'}`}>
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
          )}
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

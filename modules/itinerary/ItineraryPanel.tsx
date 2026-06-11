/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, FormEvent, DragEvent } from 'react';
import { Calendar, Pin, Lock, MapPin, Clock, Plus, Trash2, ShieldCheck, ChevronLeft, ChevronRight, Menu, ChevronDown, X, Car, ExternalLink, Sparkles, Share2 } from 'lucide-react';
import { ItineraryDay, ItineraryItem } from '@/shared/types/index';
import GooglePlaceDetailsCard from '@/shared/utils/GooglePlaceDetailsCard';
import { haversineKm } from '@/shared/utils/geo';
import { fromMinutes } from '@/shared/utils/temporal';


const PushPinIcon = ({ className, pinned }: { className?: string; pinned: boolean }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-3.5 h-3.5 transition-all duration-300 ease-out transform origin-center pointer-events-none select-none ${
        pinned ? 'rotate-0 text-blue-500 fill-blue-500/25' : 'rotate-45 text-slate-300 fill-none'
      } ${className || ''}`}
      stroke="currentColor"
      strokeWidth={pinned ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v4" />
      <path d="M5 17h14" />
      <path d="M6 17c1.5-1.5 3-4 3-7V6c0-1.5-1-2-1-2h8s-1 .5-1 2v4c0 3 1.5 5.5 3 7" />
    </svg>
  );
};


const START_HOUR = 7; // 7 AM
const END_HOUR = 22;  // 10 PM
const HOUR_HEIGHT = 32; // Reduced from 38
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;

// Returns minutes-since-midnight; defaults to 540 (9 AM) to match optimizer.ts behaviour.
const parseTimeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 540;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/);
  if (!match) return 540;
  
  let hour = parseInt(match[1], 10);
  let minute = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];

  if (ampm) {
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
};

const getDistanceAndDuration = (item1: any, item2: any) => {
  if (!item1 || !item2) return null;
  const lat1 = item1.lat;
  const lng1 = item1.lng;
  const lat2 = item2.lat;
  const lng2 = item2.lng;

  if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) {
    return { distance: '2.5 km', durationMin: 12, mode: 'driving' };
  }

  if (lat1 === lat2 && lng1 === lng2) {
    return { distance: '0.2 km', durationMin: 3, mode: 'driving' };
  }

  // Great-circle distance via the shared geo primitive (single source of truth — shared/utils/geo).
  // The undefined-coord guards above mean a finite number here; the >100km sanitize below still
  // catches normalized map-space placeholder coords (per the PR #16 fix).
  let distanceKm = haversineKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) ?? 0;

  // Sanitize extreme / layout coordinate placements to keep Kyoto values pristine
  if (distanceKm > 100) {
    const strHash = (item1.id || '') + (item2.id || '');
    let hash = 0;
    for (let i = 0; i < strHash.length; i++) {
      hash = strHash.charCodeAt(i) + ((hash << 5) - hash);
    }
    const val = Math.abs(hash);
    distanceKm = 1.2 + (val % 45) / 10; // realistic distance 1.2 to 5.7 km
  }

  const drivingSpeedKmh = 25;
  let durationMin = Math.round((distanceKm / drivingSpeedKmh) * 60 + 3);
  durationMin = Math.max(5, durationMin);

  return {
    distance: distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`,
    durationMin,
    mode: 'driving'
  };
};

const getCategoryCardStyles = (cat: string, isSelected: boolean) => {
  let bg = 'bg-slate-50';
  let border = 'border-slate-200';
  let borderLeft = 'border-l-4 border-l-slate-400';
  let text = 'text-slate-800';
  let labelBg = 'bg-slate-200/50 text-slate-600';

  switch (cat) {
    case 'sight':
      bg = isSelected ? 'bg-blue-50/95' : 'bg-[#F2F7FE]';
      border = isSelected ? 'border-blue-400' : 'border-[#2F80ED]/15';
      borderLeft = 'border-l-4 border-l-[#2F80ED]';
      text = 'text-[#1F5BB0]';
      labelBg = 'bg-[#2F80ED]/10 text-[#2F80ED]';
      break;
    case 'food':
      bg = isSelected ? 'bg-orange-50/95' : 'bg-[#FFF9F3]';
      border = isSelected ? 'border-orange-400' : 'border-[#F2994A]/15';
      borderLeft = 'border-l-4 border-l-[#F2994A]';
      text = 'text-[#C56C1B]';
      labelBg = 'bg-[#F2994A]/10 text-[#F2994A]';
      break;
    case 'stay':
      bg = isSelected ? 'bg-purple-50/95' : 'bg-[#FAF5FF]';
      border = isSelected ? 'border-purple-400' : 'border-[#9B51E0]/15';
      borderLeft = 'border-l-4 border-l-[#9B51E0]';
      text = 'text-[#7D38C0]';
      labelBg = 'bg-[#9B51E0]/10 text-[#9B51E0]';
      break;
    case 'transit':
      bg = isSelected ? 'bg-green-50/95' : 'bg-[#F3FCF6]';
      border = isSelected ? 'border-green-400' : 'border-[#27AE60]/15';
      borderLeft = 'border-l-4 border-l-[#27AE60]';
      text = 'text-[#1C8C4B]';
      labelBg = 'bg-[#27AE60]/10 text-[#27AE60]';
      break;
    case 'booking':
      bg = isSelected ? 'bg-red-50/95' : 'bg-[#FFF5F5]';
      border = isSelected ? 'border-red-400' : 'border-[#EB5757]/15';
      borderLeft = 'border-l-4 border-l-[#EB5757]';
      text = 'text-[#C93B3B]';
      labelBg = 'bg-[#EB5757]/10 text-[#EB5757]';
      break;
    default:
      bg = isSelected ? 'bg-slate-50/95' : 'bg-[#F8F9FA]';
      border = isSelected ? 'border-[#8D99AE]/50' : 'border-[#8D99AE]/15';
      borderLeft = 'border-l-4 border-l-[#8D99AE]';
      text = 'text-[#535D70]';
      labelBg = 'bg-[#8D99AE]/10 text-[#8D99AE]';
      break;
  }
  return { bg, border, borderLeft, text, labelBg };
};

const getShortDateString = (fullDate: string) => {
  const parts = fullDate.split(', ');
  if (parts.length < 2) return fullDate;
  const dayName = parts[0];
  const dateName = parts[1];
  
  const shortDay = dayName.substring(0, 3);
  let shortDate = dateName;
  const monthReplacements: { [key: string]: string } = {
    'January': 'Jan',
    'February': 'Feb',
    'March': 'Mar',
    'April': 'Apr',
    'May': 'May',
    'June': 'Jun',
    'July': 'Jul',
    'August': 'Aug',
    'September': 'Sep',
    'October': 'Oct',
    'November': 'Nov',
    'December': 'Dec'
  };
  for (const [fullMonth, shortMonth] of Object.entries(monthReplacements)) {
    if (shortDate.startsWith(fullMonth)) {
      shortDate = shortDate.replace(fullMonth, shortMonth);
      break;
    }
  }
  return `${shortDay}, ${shortDate}`;
};

interface ItineraryPanelProps {
  currentDay: ItineraryDay;
  days: ItineraryDay[];
  items: ItineraryItem[];
  selectedItemId?: string;
  hoveredItemId?: string;
  viewType: 'day' | 'week' | 'month';
  focusMode: boolean;
  onSelectItem: (id: string | undefined) => void;
  onHoverItem?: (id: string | undefined) => void;
  onSelectDay: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleLock: (id: string) => void;
  onAddItem: (item: Partial<ItineraryItem>) => void;
  onRemoveItem: (id: string) => void;
  onSetViewType: (type: 'day' | 'week' | 'month') => void;
  onUpdateItemTime?: (id: string, newTime: string) => void;
  onPromotePocketItemToTime?: (placeItem: any, timeStr: string) => void;
  onShare?: () => void;
}

export default function ItineraryPanel({
  currentDay,
  days,
  items,
  selectedItemId,
  hoveredItemId,
  viewType,
  focusMode,
  onSelectItem,
  onHoverItem,
  onSelectDay,
  onTogglePin,
  onToggleLock,
  onAddItem,
  onRemoveItem,
  onSetViewType,
  onUpdateItemTime,
  onPromotePocketItemToTime,
  onShare
}: ItineraryPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // Failsafe: always clear the dragging flag when ANY drag ends anywhere in the document.
  // The per-chip onDragEnd is not enough — dragging a chip into the pocket REMOVES the chip
  // from the board, so its dragend never fires and draggingItemId would stick, leaving every
  // chip pointer-events-none (the calendar then "can't drag" or click until a reload).
  useEffect(() => {
    const reset = () => setDraggingItemId(null);
    document.addEventListener('dragend', reset);
    document.addEventListener('drop', reset);
    return () => {
      document.removeEventListener('dragend', reset);
      document.removeEventListener('drop', reset);
    };
  }, []);

  // ── Pointer-based chip drag (restored from the proven WIP rewrite) ────────────────────────────
  // HTML5 drag on the timed chips proved unreliable (drag wouldn't initiate at all in Chrome), so
  // chips re-time via pointer events: pointerdown on a chip → pointermove tracks a snapped live
  // preview → pointerup commits via onUpdateItemTime (or treats a no-move release as select).
  // Pocket→calendar drops are untouched — pocket cards still use HTML5 drag onto the hour cells.
  const SNAP_MINUTES = 15;
  const START_MINUTES_C = START_HOUR * 60;
  const MAX_MINUTES = (END_HOUR + 1) * 60;
  const snapMin = (m: number) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
  type ChipDrag = { itemId: string; startMin: number; durationMin: number; grabOffsetMin: number; pointerStartY: number; moved: boolean };
  const gridRef = useRef<HTMLDivElement | null>(null);
  const chipDragRef = useRef<ChipDrag | null>(null);
  const [chipDrag, setChipDrag] = useState<ChipDrag | null>(null);

  const handleChipPointerMove = useCallback((e: PointerEvent) => {
    const d = chipDragRef.current;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const raw = START_MINUTES_C + (e.clientY - rect.top) / MINUTE_HEIGHT;
    let start = snapMin(raw - d.grabOffsetMin);
    start = Math.max(START_MINUTES_C, Math.min(MAX_MINUTES - d.durationMin, start));
    const next = { ...d, startMin: start, moved: d.moved || Math.abs(e.clientY - d.pointerStartY) > 4 };
    chipDragRef.current = next;
    setChipDrag(next);
  }, []);

  const handleChipPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handleChipPointerMove);
    const d = chipDragRef.current;
    chipDragRef.current = null;
    setChipDrag(null);
    if (!d) return;
    if (d.moved) onUpdateItemTime?.(d.itemId, fromMinutes(d.startMin));
    else onSelectItem(selectedItemId === d.itemId ? undefined : d.itemId);
  }, [handleChipPointerMove, onUpdateItemTime, onSelectItem, selectedItemId]);

  const handleChipPointerDown = (e: React.PointerEvent, item: ItineraryItem) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return; // inner controls keep working
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const pointerMin = START_MINUTES_C + (e.clientY - rect.top) / MINUTE_HEIGHT;
    const startMin = parseTimeToMinutes(item.startTime);
    const durationMin = item.estimatedDurationMin || 60;
    const d: ChipDrag = { itemId: item.id, startMin, durationMin, grabOffsetMin: pointerMin - startMin, pointerStartY: e.clientY, moved: false };
    chipDragRef.current = d;
    setChipDrag(d);
    window.addEventListener('pointermove', handleChipPointerMove);
    window.addEventListener('pointerup', handleChipPointerUp, { once: true });
  };
  // Unmount safety: never leave window listeners behind mid-drag.
  useEffect(() => () => {
    window.removeEventListener('pointermove', handleChipPointerMove);
    window.removeEventListener('pointerup', handleChipPointerUp);
  }, [handleChipPointerMove, handleChipPointerUp]);

  // ── Transit-leg drag (same pointer model as chips) ────────────────────────────────────────────
  // A travel block used to be glued to the end of the previous event. Users want to DETACH it —
  // slide it within the gap to say "leave at 10:30, not the instant the museum closes" — leaving
  // visible free/buffer time before the trip. We store a per-segment departure override (minutes);
  // the block's height stays the real travel duration. The slide is clamped to
  // [prevEnd, nextStart − travelDur] so it can't overlap either neighbour. Annotation only — it
  // repositions the transit block, it does not re-time the two events.
  const [transitOverrides, setTransitOverrides] = useState<Record<string, { departMin?: number }>>({});
  type TransitDrag = { segId: string; departMin: number; durationMin: number; grabOffsetMin: number; minMin: number; maxMin: number; pointerStartY: number; moved: boolean };
  const transitDragRef = useRef<TransitDrag | null>(null);
  const [transitDrag, setTransitDrag] = useState<TransitDrag | null>(null);

  const handleTransitPointerMove = useCallback((e: PointerEvent) => {
    const d = transitDragRef.current;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const raw = START_MINUTES_C + (e.clientY - rect.top) / MINUTE_HEIGHT;
    let depart = snapMin(raw - d.grabOffsetMin);
    depart = Math.max(d.minMin, Math.min(d.maxMin, depart));
    const next = { ...d, departMin: depart, moved: d.moved || Math.abs(e.clientY - d.pointerStartY) > 4 };
    transitDragRef.current = next;
    setTransitDrag(next);
  }, []);

  const handleTransitPointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handleTransitPointerMove);
    const d = transitDragRef.current;
    transitDragRef.current = null;
    setTransitDrag(null);
    if (!d || !d.moved) return;
    setTransitOverrides(prev => ({ ...prev, [d.segId]: { departMin: d.departMin } }));
  }, [handleTransitPointerMove]);

  const handleTransitPointerDown = (e: React.PointerEvent, segId: string, departMin: number, durationMin: number, minMin: number, maxMin: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input')) return; // Navi link stays clickable
    if (maxMin <= minMin) return; // no room to slide
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    const pointerMin = START_MINUTES_C + (e.clientY - rect.top) / MINUTE_HEIGHT;
    const d: TransitDrag = { segId, departMin, durationMin, grabOffsetMin: pointerMin - departMin, minMin, maxMin, pointerStartY: e.clientY, moved: false };
    transitDragRef.current = d;
    setTransitDrag(d);
    window.addEventListener('pointermove', handleTransitPointerMove);
    window.addEventListener('pointerup', handleTransitPointerUp, { once: true });
  };
  useEffect(() => () => {
    window.removeEventListener('pointermove', handleTransitPointerMove);
    window.removeEventListener('pointerup', handleTransitPointerUp);
  }, [handleTransitPointerMove, handleTransitPointerUp]);

  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00 AM');
  const [newCategory, setNewCategory] = useState<'sight' | 'food' | 'stay' | 'transit'>('sight');
  const [newArea, setNewArea] = useState('');

  const formatHourToTimeString = (hour: number): string => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let h = hour % 12;
    if (h === 0) h = 12;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    return `${hStr}:00 ${ampm}`;
  };

  const formatHourMinuteToTimeString = (hour: number, minute: number): string => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let h = hour % 12;
    if (h === 0) h = 12;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    const mStr = minute === 30 ? '30' : '00';
    return `${hStr}:${mStr} ${ampm}`;
  };

  const handleDoubleClickHour = (hour: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = clickY / rect.height; // Between 0 and 1
    
    // Choose closest 30-minute chunk (either :00 or :30)
    const minute = ratio >= 0.5 ? 30 : 0;
    
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let h = hour % 12;
    if (h === 0) h = 12;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    const mStr = minute === 30 ? '30' : '00';
    
    const timeStr = `${hStr}:${mStr} ${ampm}`;
    setNewTime(timeStr);
    setShowAddForm(true);
  };

  const handleDropOnHour = (e: React.DragEvent, hour: number, precalculatedMinute?: number) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      let targetMinute = 0;
      if (precalculatedMinute !== undefined) {
        targetMinute = precalculatedMinute;
      } else {
        // Compute from current hour-slot bounding rect
        const rect = e.currentTarget.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        const ratio = dropY / rect.height;
        targetMinute = ratio >= 0.5 ? 30 : 0;
      }

      const timeStr = formatHourMinuteToTimeString(hour, targetMinute);

      if (data.type === 'pocket-item' && onPromotePocketItemToTime) {
        onPromotePocketItemToTime(data.item, timeStr);
      } else if (data.type === 'calendar-item' && onUpdateItemTime) {
        onUpdateItemTime(data.itemId, timeStr);
      }
    } catch (err) {
      console.error('Failed dummy JSON parsing of dropped elements:', err);
    }
  };

  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showAddForm) {
        setShowAddForm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddForm]);

  const currentDayItems = items
    .filter(item => item.dayId === currentDay.id);

  const handleCyclePinState = (item: ItineraryItem) => {
    if (item.pinState === 'none') {
      onTogglePin(item.id);
    } else if (item.pinState === 'soft') {
      onTogglePin(item.id);
      onToggleLock(item.id);
    } else {
      onToggleLock(item.id);
    }
  };

  const START_MINUTES = START_HOUR * 60;

  // Items with no startTime are shown in the "Flexible & All-Day" section
  const flexibleItems = currentDayItems.filter(item => !item.startTime);

  const timedItems = currentDayItems.filter(item => !!item.startTime)
    .map(item => {
      const min = parseTimeToMinutes(item.startTime);
      const duration = item.estimatedDurationMin || 60;
      const top = (min - START_MINUTES) * MINUTE_HEIGHT;
      const calculatedHeight = duration * MINUTE_HEIGHT;
      const height = Math.max(calculatedHeight, 38);
      return { item, min, top, height };
    })
    .sort((a, b) => a.min - b.min);

  const columns: { end: number }[][] = [];
  const positionedTimedItems = timedItems.map(timed => {
    let colIndex = 0;
    while (colIndex < columns.length) {
      const lastInCol = columns[colIndex][columns[colIndex].length - 1];
      if (timed.top >= lastInCol.end) {
        break;
      }
      colIndex++;
    }
    if (colIndex === columns.length) {
      columns.push([]);
    }
    columns[colIndex].push({ end: timed.top + timed.height });
    return { ...timed, colIndex };
  });

  // Calculate transportation gaps between consecutive scheduled items
  const transitSegments: {
    id: string;
    item1: any;
    item2: any;
    top: number;
    height: number;
    distance: string;
    durationMin: number;
    mode: string;
    gapMinutes: number;
    departMin: number;   // current departure (override or glued-to-prev default)
    minMin: number;      // earliest departure (prev event ends)
    maxMin: number;      // latest departure (arrive before next starts)
  }[] = [];

  for (let i = 0; i < positionedTimedItems.length - 1; i++) {
    const current = positionedTimedItems[i];
    const next = positionedTimedItems[i + 1];

    const currentEndMin = current.min + (current.item.estimatedDurationMin || 60);
    const nextStartMin = next.min;

    const est = getDistanceAndDuration(current.item, next.item);
    if (est) {
      const segId = `transit-${current.item.id}-${next.item.id}`;
      const gapMin = nextStartMin - currentEndMin;
      // Height = the REAL travel time span (not the gap), so the block visually reads as duration.
      const height = est.durationMin * MINUTE_HEIGHT;
      // Slide window: depart no earlier than the prev event ends, arrive no later than the next
      // begins. Default departure is glued to the prev end; a drag stores an override.
      const minMin = currentEndMin;
      const maxMin = nextStartMin - est.durationMin;
      const live = transitDrag?.segId === segId ? transitDrag.departMin : undefined;
      const overridden = transitOverrides[segId]?.departMin;
      const departMin = Math.max(minMin, Math.min(maxMin < minMin ? minMin : maxMin, live ?? overridden ?? currentEndMin));
      const top = (departMin - START_MINUTES) * MINUTE_HEIGHT;

      transitSegments.push({
        id: segId,
        item1: current.item,
        item2: next.item,
        top,
        height,
        distance: est.distance,
        durationMin: est.durationMin,
        mode: est.mode,
        gapMinutes: gapMin,
        departMin,
        minMin,
        maxMin,
      });
    }
  }

  const handleAddNewItem = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddItem({
      title: newTitle.trim(),
      startTime: newTime,
      category: newCategory,
      area: newArea.trim() || 'Custom Stop',
      pinState: 'none'
    });

    setNewTitle('');
    setNewArea('');
    setShowAddForm(false);
  };

  const getCategoryColorClass = (cat: string) => {
    switch (cat) {
      case 'transit': return 'bg-cat-transit';
      case 'stay': return 'bg-cat-stay';
      case 'food': return 'bg-cat-food';
      case 'sight': return 'bg-cat-sight';
      default: return 'bg-cat-backup';
    }
  };

  const currentIndex = days.findIndex(d => d.id === currentDay.id);
  const isFirstDay = currentIndex === 0;
  const isLastDay = currentIndex === days.length - 1;

  const handlePrevDay = () => {
    if (!isFirstDay) {
      onSelectDay(days[currentIndex - 1].id);
    }
  };

  const handleNextDay = () => {
    if (!isLastDay) {
      onSelectDay(days[currentIndex + 1].id);
    }
  };

  return (
    <aside
      className="w-full bg-white border border-border-subtle rounded-2xl flex flex-col shadow-sm shrink-0 overflow-hidden h-full"
    >
      {/* Toolbar — single slim row. The trip identity (title/dates/switcher) lives ONLY in the
          header band now; this row keeps the per-view controls: day navigation centered (day
          view), and the view switcher + share + add right-aligned across all views. */}
      <div className="h-[38px] border-b border-border-subtle flex items-center justify-between px-3 bg-white shrink-0 select-none relative">
        {viewType === 'day' ? (
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handlePrevDay}
              disabled={isFirstDay}
              className="p-1 rounded hover:bg-surface-container cursor-pointer text-secondary transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-on-surface select-none whitespace-nowrap min-w-[90px] text-center tracking-tight">
              {getShortDateString(currentDay.fullDateString)}
            </span>
            <button
              type="button"
              onClick={handleNextDay}
              disabled={isLastDay}
              className="p-1 rounded hover:bg-surface-container cursor-pointer text-secondary transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : <div className="flex-1" />}

        <div className="flex items-center gap-1 shrink-0">
          {/* View switcher — right-aligned */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
              className="flex items-center gap-1 px-2 py-1 hover:bg-surface-container-low border border-border-subtle rounded-lg text-[11px] font-bold text-on-surface transition-all cursor-pointer bg-white"
            >
              <span>
                {viewType === 'day' ? 'Day View' : viewType === 'week' ? 'Week View' : 'Month View'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-secondary shrink-0" />
            </button>

            {isViewDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setIsViewDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-1.5 w-32 bg-white border border-border-subtle rounded-xl shadow-lg py-1 z-50 animate-fadeIn text-xs">
                  {(['day', 'week', 'month'] as const).map(viewTypeOption => (
                    <button
                      key={viewTypeOption}
                      type="button"
                      onClick={() => {
                        onSetViewType(viewTypeOption);
                        setIsViewDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 hover:bg-surface-container-low transition-colors font-semibold cursor-pointer ${
                        viewType === viewTypeOption ? 'text-primary bg-accent-soft/40 font-bold' : 'text-on-surface'
                      }`}
                    >
                      {viewTypeOption === 'day' ? 'Day View' : viewTypeOption === 'week' ? 'Week View' : 'Month View'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Share — next to the view switcher */}
          <button
            onClick={() => onShare?.()}
            className="p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer text-slate-400 hover:text-primary"
            title="Share current plan"
          >
            <Share2 className="w-4 h-4" />
          </button>
          {viewType === 'day' && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center"
              title="Add New Stop"
            >
              <Plus className={`w-4 h-4 transition-transform duration-200 ${showAddForm ? 'rotate-45 text-red-500' : 'text-primary'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Render matching workspace views based on selected setting */}
      {viewType === 'day' && (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/20">
          <div className="flex-grow overflow-y-auto custom-scrollbar p-3 space-y-3">
            {/* Flexible / All Day Stops Category */}
            {flexibleItems.length > 0 && (
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl mb-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Flexible & All-Day stops ({flexibleItems.length})
                </div>
                <div className="flex flex-col gap-2">
                  {flexibleItems.map((item) => {
                    const isSelected = selectedItemId === item.id;
                    const styles = getCategoryCardStyles(item.category, isSelected);
                    return (
                      <div
                        key={item.id}
                        onClick={() => onSelectItem(isSelected ? undefined : item.id)}
                        className={`p-2.5 rounded-xl border shadow-sm transition-all cursor-pointer flex flex-col justify-between ${styles.bg} ${styles.border} ${styles.borderLeft} ${
                          isSelected ? 'ring-1 ring-primary/25 shadow-md scale-[1.01]' : 'hover:scale-[1.005]'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-slate-200/50 shadow-sm bg-white">
                              <img 
                                src={item.imageUrl || `https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=150&auto=format&fit=crop`} 
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col h-12">
                              <div className="min-w-0">
                                <h3 className={`text-xs font-bold leading-tight truncate ${styles.text}`}>
                                  {item.title}
                                </h3>
                                <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1 leading-tight">
                                  {item.openingHours ? (
                                    <span className="flex items-center gap-1">
                                      {item.openingHours.split(' - ')[0]} - {item.openingHours.split(' - ')[1]}
                                    </span>
                                  ) : (
                                    <span>{item.area}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-450 font-medium mt-0.5 flex items-center gap-1 leading-tight">
                                  {item.subCategory && <span>{item.subCategory}</span>}
                                  {item.subCategory && item.budget && <span className="opacity-40">•</span>}
                                  {item.budget && <span className="text-primary font-bold">{item.budget}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-1.5 shrink-0 ml-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveItem(item.id);
                              }}
                              className="p-1 rounded-md hover:bg-black/5 opacity-40 hover:opacity-100 text-slate-500 hover:text-red-500 transition-all cursor-pointer shrink-0 -mt-0.5 -mr-0.5"
                              title="Remove stop"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCyclePinState(item);
                              }}
                              className="p-1 rounded-md hover:bg-black/5 transition-all cursor-pointer text-slate-500"
                              title="Cycle Pin/Lock State"
                            >
                              {item.pinState === 'hard' ? (
                                <Lock className="w-3.5 h-3.5 text-[#1F6FD6]" />
                              ) : (
                                <PushPinIcon pinned={item.pinState === 'soft'} />
                              )}
                            </button>
                          </div>
                        </div>
                        {isSelected && (
                          <GooglePlaceDetailsCard
                            title={item.title}
                            category={item.category}
                            rating={item.rating}
                            userRatingCount={item.userRatingCount}
                            phoneNumber={item.phoneNumber}
                            website={item.website}
                            reservable={item.reservable}
                            editorialSummary={item.editorialSummary}
                            formattedAddress={item.formattedAddress}
                            openingHours={item.openingHours}
                            estimatedDurationMin={item.estimatedDurationMin}
                            budget={item.budget}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Real Calendar Grid View */}
            <div className="relative overflow-visible w-full px-1">

              <div
                ref={gridRef}
                className="relative"
                style={{ height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px` }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const dropY = e.clientY - rect.top;
                  const totalHeight = (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT;
                  const ratio = Math.max(0, Math.min(0.999, dropY / totalHeight));
                  const totalHours = END_HOUR - START_HOUR + 1;
                  const snappedMinutes = Math.round((ratio * totalHours * 60) / 30) * 30;
                  const targetHour = START_HOUR + Math.floor(snappedMinutes / 60);
                  const targetMinute = snappedMinutes % 60;
                  const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR, targetHour));
                  handleDropOnHour(e, clampedHour, targetMinute);
                }}
              >
                {/* Horizontal lines grid */}
                {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, index) => {
                  const hour = index + START_HOUR;
                  const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

                  return (
                    <div 
                      key={hour} 
                      className="absolute left-0 right-0 border-t border-slate-100 group/hour relative" 
                      style={{ top: `${index * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    >
                      {/* Hour labels on left lane */}
                      <span className="absolute -top-2 left-0 w-9 text-right text-[10px] font-bold text-slate-400 select-none pr-1.5">
                        {displayHour}
                      </span>

                      {/* Drop target and Double-click zone with premium design hint */}
                      <div
                        onDoubleClick={(e) => handleDoubleClickHour(hour, e)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add('bg-primary/5');
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove('bg-primary/5');
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          e.currentTarget.classList.remove('bg-primary/5');
                          handleDropOnHour(e, hour);
                        }}
                        className="absolute left-10 right-0 top-0 bottom-0 hover:bg-slate-50/40 transition-colors duration-100 cursor-cell flex items-center justify-end pr-3"
                        title="Double-click to schedule, or drop an activity here"
                      >
                        <span className="text-[9px] text-primary/60 font-bold bg-white px-2 py-0.5 rounded border border-primary/20 shadow-sm flex items-center gap-0.5 select-none pointer-events-none opacity-0 group-hover/hour:opacity-100 transition-opacity duration-150">
                          <Plus className="w-2.5 h-2.5 text-primary" />
                          Double Click to Add
                        </span>
                      </div>

                      {/* Hour line offset */}
                      <div className="absolute left-10 right-0 border-t border-slate-100/70 pointer-events-none" style={{ top: 0 }} />
                    </div>
                  );
                })}

                {/* Event absolute chips inside the calendar grid region */}
                <div className="absolute top-0 bottom-0 left-10 right-0 pointer-events-none">
                  {positionedTimedItems.map(({ item, top, height, colIndex }) => {
                    const isSelected = selectedItemId === item.id;
                    const isHovered = hoveredItemId === item.id;
                    const styles = getCategoryCardStyles(item.category, isSelected);
                    const isMovingThis = chipDrag?.itemId === item.id;
                    const isMovingOther = chipDrag !== null && !isMovingThis;
                    // While dragging, the chip follows the live snapped preview position.
                    const liveTop = isMovingThis
                      ? (chipDrag!.startMin - START_MINUTES_C) * MINUTE_HEIGHT
                      : Math.max(0, Math.min(top, (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT - height));

                    return (
                      <div
                        key={item.id}
                        style={{
                          position: 'absolute',
                          top: `${liveTop}px`,
                          height: `${height}px`,
                          left: `${colIndex * 16}px`,
                          width: `calc(100% - ${colIndex * 16}px)`,
                          zIndex: isMovingThis ? 50 : isSelected ? 30 : 10 + colIndex,
                          touchAction: 'none',
                        }}
                        onPointerDown={(e) => handleChipPointerDown(e, item)}
                        onMouseEnter={() => onHoverItem?.(item.id)}
                        onMouseLeave={() => onHoverItem?.(undefined)}
                        className={`${
                          isMovingThis ? 'pointer-events-auto select-none cursor-grabbing ring-2 ring-primary/50 shadow-lg' :
                          isMovingOther ? 'pointer-events-none opacity-30 select-none' : 'pointer-events-auto cursor-grab hover:scale-[1.005] hover:shadow'
                        } p-1.5 rounded-r-xl border ${isMovingThis ? '' : 'transition-all'} group flex flex-col justify-between ${styles.bg} ${styles.border} ${styles.borderLeft} ${
                          isSelected ? 'ring-1 ring-primary/25 shadow-md scale-[1.01]'
                            : isHovered && !isMovingThis ? 'ring-1 ring-primary/40 shadow-md' : 'shadow-sm'
                        }`}
                      >
                        {isMovingThis && chipDrag!.moved && (
                          <span className="absolute -left-1 -top-5 text-[10px] font-bold text-primary bg-white border border-primary/30 rounded px-1.5 py-0.5 shadow-sm select-none">
                            {fromMinutes(chipDrag!.startMin)}
                          </span>
                        )}
                        <div className="flex flex-col h-full justify-between">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <h3 className={`text-xs font-bold leading-tight ${styles.text}`}>
                                {item.title}
                              </h3>
                              {height >= 80 && item.note && (
                                <p className="text-[10px] italic text-blue-600 mt-1 leading-snug flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{item.note}</span>
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveItem(item.id);
                              }}
                              className="p-1 rounded-md hover:bg-black/5 opacity-40 hover:opacity-100 text-slate-500 hover:text-red-500 transition-all cursor-pointer shrink-0 -mt-0.5 -mr-0.5"
                              title="Remove stop"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex justify-between items-end gap-2 mt-1">
                            {item.subCategory || item.budget || item.openingHours ? (
                              <div className="text-[9px] text-slate-450 font-medium flex-1 flex flex-wrap items-center gap-1 leading-tight pointer-events-none truncate select-none">
                                {item.subCategory && <span className="font-semibold text-slate-500">{item.subCategory}</span>}
                                {item.budget && <span className="bg-slate-100 text-slate-500 px-0.5 rounded-sm text-[8px] font-bold">{item.budget}</span>}
                                {item.openingHours && <span className="text-slate-400 truncate">{item.openingHours}</span>}
                                {item.estimatedDurationMin && <span className="text-slate-450 opacity-60">• {item.estimatedDurationMin}m</span>}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-medium truncate flex-1 block">
                                {item.area} {item.estimatedDurationMin ? `• ${item.estimatedDurationMin}m` : ''}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCyclePinState(item);
                              }}
                              className="p-1 rounded-md hover:bg-black/5 transition-all text-slate-500 shrink-0 cursor-pointer -mb-0.5 -mr-0.5"
                              title="Cycle Pin/Lock State"
                            >
                              {item.pinState === 'hard' ? (
                              <Lock className="w-3.5 h-3.5 text-[#1F6FD6]" />
                            ) : (
                              <PushPinIcon pinned={item.pinState === 'soft'} className={item.pinState === 'soft' ? 'animate-bounce' : ''} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {transitSegments.map(segment => {
                  if (segment.height <= 2) return null;
                  const isMovingChip = chipDrag !== null;
                  const isDraggingThis = transitDrag?.segId === segment.id;
                  const isDraggingOtherTransit = transitDrag !== null && !isDraggingThis;
                  const canSlide = segment.maxMin > segment.minMin;
                  // Dim transit while a CHIP or a DIFFERENT transit is being dragged.
                  const dim = isMovingChip || isDraggingOtherTransit;

                  return (
                    <div
                      key={segment.id}
                      onPointerDown={(e) => canSlide && handleTransitPointerDown(e, segment.id, segment.departMin, segment.durationMin, segment.minMin, segment.maxMin)}
                      style={{
                        position: 'absolute',
                        top: `${segment.top}px`,
                        height: `${segment.height}px`,
                        left: '0px',
                        right: '0px',
                        zIndex: isDraggingThis ? 40 : 5,
                        touchAction: canSlide ? 'none' : undefined,
                      }}
                      className={`${
                        dim ? 'pointer-events-none opacity-20' : 'pointer-events-auto'
                      } ${canSlide ? (isDraggingThis ? 'cursor-grabbing' : 'cursor-grab') : ''} ${
                        isDraggingThis ? 'ring-2 ring-slate-400/60 shadow-lg bg-slate-400/[0.07]' : 'bg-slate-400/[0.03] hover:bg-slate-400/[0.05]'
                      } border-y border-r border-slate-200/50 border-l-4 border-l-slate-400 rounded-r-xl ${isDraggingThis ? '' : 'transition-all duration-150'} flex items-center justify-center group select-none overflow-visible shadow-sm`}
                    >
                      {/* Live departure badge while sliding */}
                      {isDraggingThis && transitDrag!.moved && (
                        <span className="absolute -left-1 -top-5 text-[10px] font-bold text-slate-600 bg-white border border-slate-300 rounded px-1.5 py-0.5 shadow-sm select-none z-10">
                          leave {fromMinutes(segment.departMin)}
                        </span>
                      )}
                      {/* Middle textual note */}
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-full shadow-sm text-[10px] text-slate-500 select-none max-w-[95%] pointer-events-auto transition-transform duration-100 group-hover:scale-105">
                        <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-600 capitalize">{segment.mode}</span>
                        <span className="text-slate-355 shrink-0">•</span>
                        <span className="font-medium text-slate-500 shrink-0">{segment.distance}</span>
                        <span className="text-slate-355 shrink-0">•</span>
                        <span className="font-semibold text-slate-700 shrink-0">{segment.durationMin} min</span>
                        <span className="text-slate-355 shrink-0">•</span>
                        <a 
                          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(segment.item1.formattedAddress || segment.item1.title)}&destination=${encodeURIComponent(segment.item2.formattedAddress || segment.item2.title)}&travelmode=driving`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onDragStart={(e) => e.preventDefault()}
                          className="text-blue-500 hover:text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5 shrink-0 transition-colors"
                          title="Open directions in Google Maps app"
                        >
                          Navi <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}

                {/* Absolute Inline Add Form */}
                {showAddForm && (() => {
                  const newTimeMinutes = parseTimeToMinutes(newTime);
                  const minutesClamp = Math.max(START_MINUTES, Math.min((END_HOUR + 1) * 60, newTimeMinutes));
                  let formTop = (minutesClamp - START_MINUTES) * MINUTE_HEIGHT;

                  // Adjust the overlay upward slightly if it's too close to the end of the day, to keep it within view
                  const containerMaxHeight = (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT;
                  const estimatedFormHeight = 185;
                  if (formTop + estimatedFormHeight > containerMaxHeight) {
                    formTop = Math.max(0, containerMaxHeight - estimatedFormHeight);
                  }

                  return (
                    <form
                      onSubmit={handleAddNewItem}
                      style={{
                        position: 'absolute',
                        top: `${formTop}px`,
                        left: '4px',
                        right: '4px',
                        zIndex: 100,
                      }}
                      className="pointer-events-auto bg-white border border-primary/30 p-2.5 rounded-xl flex flex-col gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)] text-on-surface animate-fadeIn"
                    >
                      <div className="flex justify-between items-center px-0.5">
                        <div className="text-[10px] font-bold text-primary flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          <span>Add Activity • {newTime}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <input
                        type="text"
                        placeholder="Activity Title (e.g. Kyoto Tower)..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full bg-white border border-border-subtle rounded-lg px-2 py-1.5 text-[11px] outline-none focus:ring-1 focus:ring-primary font-medium text-on-surface"
                        required
                        autoFocus
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          placeholder="09:00 AM"
                          value={newTime}
                          onChange={(e) => setNewTime(e.target.value)}
                          className="w-full bg-white border border-border-subtle rounded-lg px-2 py-1.5 text-[10px] outline-none focus:ring-1 focus:ring-primary font-medium text-on-surface"
                        />
                        <input
                          type="text"
                          placeholder="Area..."
                          value={newArea}
                          onChange={(e) => setNewArea(e.target.value)}
                          className="w-full bg-white border border-border-subtle rounded-lg px-2 py-1.5 text-[10px] outline-none focus:ring-1 focus:ring-primary font-medium text-on-surface"
                        />
                      </div>
                      <div className="flex gap-2 text-[9px] font-semibold text-secondary items-center justify-between px-0.5">
                        <span>Category:</span>
                        <div className="flex gap-1">
                          {(['sight', 'food', 'stay', 'transit'] as const).map((cat) => (
                            <button
                              type="button"
                              key={cat}
                              onClick={() => setNewCategory(cat)}
                              className={`px-1.5 py-0.5 rounded capitalize transition-all cursor-pointer border ${
                                newCategory === cat
                                  ? 'bg-primary text-white border-primary shadow-sm'
                                  : 'bg-white border-border-subtle hover:bg-slate-50 text-secondary'
                              }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1.5 justify-end mt-0.5 px-0.5">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="px-2 py-1 text-[10px] font-bold border border-border-subtle rounded-lg text-secondary cursor-pointer bg-white hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 text-[10px] font-bold bg-primary text-white rounded-lg cursor-pointer hover:bg-primary-dark shadow-sm transition-colors"
                        >
                          Add Stop
                        </button>
                      </div>
                    </form>
                  );
                })()}
              </div>
            </div>

              {currentDayItems.length === 0 && (
                <div className="py-12 text-center absolute inset-0 bg-white/95 z-20 rounded-2xl flex flex-col justify-center items-center">
                  <p className="text-secondary text-xs italic">No items scheduled for this day yet.</p>
                  <p className="text-[10px] text-tertiary mt-1">Quick-add from the Pocket below, or click insert above.</p>
                </div>
              )}
            </div>


          </div>
        </div>
      )}

      {/* Week Calendar Board ( इमेज 1 representation ) */}
      {viewType === 'week' && (
        <div className="flex-grow flex flex-col overflow-hidden bg-bg-panel-muted select-none">
          <div className="grid grid-cols-7 border-b border-border-subtle bg-white sticky top-0 shrink-0">
            {days.map((day) => (
              <div
                key={day.id}
                onClick={() => onSelectDay(day.id)}
                className={`py-3 text-center border-r border-border-subtle cursor-pointer transition-all hover:bg-bg-panel-hover last:border-r-0 ${
                  currentDay.id === day.id ? 'bg-accent-soft' : ''
                }`}
              >
                <span className={`text-[10px] font-bold block ${currentDay.id === day.id ? 'text-primary' : 'text-secondary'}`}>
                  {day.label}
                </span>
                <span className={`text-md font-extrabold leading-none ${currentDay.id === day.id ? 'text-primary' : 'text-on-surface'}`}>
                  {day.date}
                </span>
              </div>
            ))}
          </div>

          {/* List Days column stacks */}
          <div className="flex-1 grid grid-cols-7 overflow-x-auto overflow-y-auto custom-scrollbar bg-white">
            {days.map((day) => {
              const dayItems = items
                .filter(item => item.dayId === day.id)
                .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

              return (
                <div
                  key={day.id}
                  onClick={() => onSelectDay(day.id)}
                  className={`border-r border-border-subtle p-2 flex flex-col gap-2.5 min-h-[300px] last:border-r-0 cursor-pointer ${
                    day.id === currentDay.id ? 'bg-accent-soft/20' : 'bg-white'
                  }`}
                >
                  {dayItems.map((item) => {
                    const isSelected = selectedItemId === item.id;
                    const hasLock = item.pinState === 'hard';

                    return (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(isSelected ? undefined : item.id);
                          onSelectDay(day.id);
                        }}
                        className={`p-2.5 rounded-xl border transition-all text-left group relative shadow-sm cursor-pointer ${
                          isSelected
                            ? 'bg-[#EEF6FF] border-primary'
                            : hasLock
                            ? 'bg-accent-soft border-primary/20'
                            : 'bg-white border-border-subtle hover:border-primary/20'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <div className="flex items-center gap-1 capitalize text-[9px] font-bold text-secondary">
                            <span className={`w-1.5 h-1.5 rounded-full ${getCategoryColorClass(item.category)}`}></span>
                            <span>{item.startTime}</span>
                          </div>
                          {hasLock && <Lock className="w-2.5 h-2.5 text-primary shrink-0 mt-0.5" />}
                        </div>
                        <h4 className="text-[11px] font-bold leading-tight text-on-surface mt-1 truncate">
                          {item.title}
                        </h4>
                        {item.note && (
                          <p className="text-[8px] text-primary truncate mt-0.5">{item.note}</p>
                        )}
                        {isSelected && (
                          <GooglePlaceDetailsCard
                            title={item.title}
                            category={item.category}
                            rating={item.rating}
                            userRatingCount={item.userRatingCount}
                            phoneNumber={item.phoneNumber}
                            website={item.website}
                            reservable={item.reservable}
                            editorialSummary={item.editorialSummary}
                            formattedAddress={item.formattedAddress}
                            openingHours={item.openingHours}
                            estimatedDurationMin={item.estimatedDurationMin}
                            budget={item.budget}
                          />
                        )}
                      </div>
                    );
                  })}

                  {dayItems.length === 0 && (
                    <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-border-subtle rounded-xl min-h-[100px] opacity-40">
                      <span className="text-[9px] text-tertiary text-center">Add Activity</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Month Calendar Board ( इमेज 3 representation ) */}
      {viewType === 'month' && (
        <div className="flex-grow flex flex-col overflow-hidden select-none bg-white">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-bg-panel-muted shrink-0">
            <div className="flex items-center gap-4">
              <h1 className="text-sm font-bold text-on-surface">April 2024</h1>
              <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border">
                <button className="p-1 hover:bg-white rounded transition-colors text-secondary cursor-pointer">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button className="p-1 hover:bg-white rounded transition-colors text-secondary cursor-pointer">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="px-2.5 py-0.5 bg-surface-container text-on-surface-variant text-[10px] font-bold rounded-full">
                {items.length} Stops Planned
              </span>
              <span className="px-2.5 py-0.5 bg-accent-soft text-primary text-[10px] font-bold rounded-full">
                {items.filter(i => i.pinState === 'hard').length} Hard Constraints
              </span>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-7 overflow-y-auto custom-scrollbar">
            {/* Headers row */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(h => (
              <div key={h} className="py-2 text-center text-[10px] font-bold text-secondary uppercase bg-white border-b border-border-subtle sticky top-0">
                {h}
              </div>
            ))}

            {/* Left padded days for April 2024 calendar grid alignment (Monday start was day 1, so April 1st was Monday) */}
            {/* Sunday empty */}
            <div className="p-2 border-r border-b border-border-subtle opacity-30 bg-surface-container-low min-h-[90px]"></div>

            {/* Rendering days 1 to 30 */}
            {Array.from({ length: 30 }, (_, index) => {
              const dayNum = index + 1;
              const dateTag = dayNum.toString();
              const isTripDay = dayNum >= 12 && dayNum <= 18;

              // Find current trip items on this day
              // April 12 is Day 1
              let mappedDayId = '';
              if (isTripDay) {
                mappedDayId = `day-${dayNum - 11}`;
              }

              const dayItems = items.filter(item => item.dayId === mappedDayId);

              return (
                <div
                  key={dayNum}
                  onClick={() => {
                    if (isTripDay) onSelectDay(mappedDayId);
                  }}
                  className={`p-2 border-r border-b border-border-subtle min-h-[90px] flex flex-col gap-1 transition-all ${
                    isTripDay
                      ? 'bg-accent-soft'
                      : 'bg-white hover:bg-bg-panel-hover'
                  }`}
                >
                  <span className={`text-[10px] font-bold ${isTripDay ? 'text-primary' : 'text-on-surface'}`}>
                    {dayNum}
                  </span>

                  <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                    {dayItems.map(item => (
                      <div
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isTripDay) {
                            onSelectDay(mappedDayId);
                            onSelectItem(item.id);
                          }
                        }}
                        className="py-1 px-1.5 rounded text-[9px] bg-white border border-border-subtle truncate flex items-center gap-1 text-on-surface font-semibold hover:border-primary shadow-sm"
                      >
                        <span className={`w-1 h-1 rounded-full shrink-0 ${getCategoryColorClass(item.category)}`} />
                        <span className="truncate">{item.startTime?.split(' ')[0]} {item.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Right padded empty days to fill the row grid */}
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="p-2 border-r border-b border-border-subtle opacity-30 bg-surface-container-low min-h-[90px]"></div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

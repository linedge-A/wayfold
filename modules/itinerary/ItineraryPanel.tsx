/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, FormEvent, DragEvent } from 'react';
import { Calendar, Pin, Lock, MapPin, Clock, Plus, Trash2, ShieldCheck, ChevronLeft, ChevronRight, Menu, ChevronDown, X, Car, ExternalLink, Sparkles, Share2, CircleSlash } from 'lucide-react';
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


const START_HOUR = 7;   // 7 AM
const END_HOUR = 22;    // 10 PM
const HOUR_HEIGHT = 60; // 60px / hour → 1px per minute, so a 15-min slot is a comfortable 15px
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;
const SNAP_MINUTES = 15; // drag/drop/create snapping granularity
const DEFAULT_DURATION = 60;
const GUTTER_PX = 56;   // width of the left time-label gutter

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

// Minutes-since-midnight → "hh:mm AM/PM"
const minutesToTimeString = (mins: number): string => {
  const clamped = Math.max(0, Math.round(mins));
  const h24 = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h = h24 % 12;
  if (h === 0) h = 12;
  const hStr = h < 10 ? `0${h}` : `${h}`;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${hStr}:${mStr} ${ampm}`;
};

const snapMinutes = (mins: number) => Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;

// Denser hour scale for the 7-column week grid.
const WEEK_HOUR_HEIGHT = 44;
const WEEK_MINUTE_HEIGHT = WEEK_HOUR_HEIGHT / 60;
const WEEK_GUTTER_PX = 40;

const VIEW_LABELS: Record<'day' | 'week' | 'month' | 'agenda', string> = {
  day: 'Day View',
  week: 'Week View',
  month: 'Month View',
  agenda: 'Itinerary',
};

type TimedEvent = { item: ItineraryItem; min: number; dur: number };
type PackedEvent = TimedEvent & { colIndex: number; columnsCount: number };

// Column-packing: overlapping events form a cluster and split the width evenly,
// matching Google/Apple Calendar side-by-side behaviour. Shared by day + week grids.
const packEvents = (evts: TimedEvent[]): PackedEvent[] => {
  const sorted = [...evts].sort((a, b) => a.min - b.min || a.dur - b.dur);
  const out: PackedEvent[] = [];
  let cluster: (TimedEvent & { colIndex: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    cluster.forEach(ev => {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c] <= ev.min) { ev.colIndex = c; colEnds[c] = ev.min + ev.dur; placed = true; break; }
      }
      if (!placed) { ev.colIndex = colEnds.length; colEnds.push(ev.min + ev.dur); }
    });
    cluster.forEach(ev => out.push({ ...ev, columnsCount: colEnds.length }));
    cluster = [];
    clusterEnd = -1;
  };
  sorted.forEach(ev => {
    if (cluster.length && ev.min >= clusterEnd) flush();
    cluster.push({ ...ev, colIndex: 0 });
    clusterEnd = Math.max(clusterEnd, ev.min + ev.dur);
  });
  flush();
  return out;
};

// "9:00am–10:30am" range string for an item.
const formatItemRange = (item: { startTime?: string; estimatedDurationMin?: number }): string => {
  if (!item.startTime) return 'Flexible';
  const start = parseTimeToMinutes(item.startTime);
  const end = start + (item.estimatedDurationMin || DEFAULT_DURATION);
  const fmt = (m: number) => minutesToTimeString(m).replace(' ', '').toLowerCase();
  return `${fmt(start)}–${fmt(end)}`;
};

// Travel methods the user can switch between on a transit leg.
type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';
const TRAVEL_MODES: TravelMode[] = ['driving', 'transit', 'bicycling', 'walking'];
const TRAVEL_MODE_META: Record<TravelMode, { speedKmh: number; overheadMin: number; label: string }> = {
  driving:   { speedKmh: 25, overheadMin: 3, label: 'Drive' },
  transit:   { speedKmh: 18, overheadMin: 6, label: 'Transit' },
  bicycling: { speedKmh: 15, overheadMin: 2, label: 'Cycle' },
  walking:   { speedKmh: 4.8, overheadMin: 1, label: 'Walk' },
};

// Estimated travel minutes for a distance under a given method.
const estimateTravelMinutes = (distanceKm: number, mode: TravelMode): number => {
  const meta = TRAVEL_MODE_META[mode] || TRAVEL_MODE_META.driving;
  const min = Math.round((distanceKm / meta.speedKmh) * 60 + meta.overheadMin);
  return Math.max(mode === 'walking' ? 2 : 5, min);
};

const getDistanceAndDuration = (item1: any, item2: any) => {
  if (!item1 || !item2) return null;
  const lat1 = item1.lat;
  const lng1 = item1.lng;
  const lat2 = item2.lat;
  const lng2 = item2.lng;

  if (lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) {
    return { distance: '2.5 km', distanceKm: 2.5, durationMin: 12, mode: 'driving' };
  }

  if (lat1 === lat2 && lng1 === lng2) {
    return { distance: '0.2 km', distanceKm: 0.2, durationMin: 3, mode: 'driving' };
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
    distanceKm,
    durationMin,
    mode: 'driving'
  };
};

// Per design-rules.md: category is metadata only, expressed as the left-border accent
// (and small tag tint) — NEVER as surface fill. Surfaces stay neutral; selection uses
// the blue soft background + accent-line border defined in the token system.
const CATEGORY_ACCENTS: Record<string, { line: string; tag: string }> = {
  sight:   { line: 'border-l-[#2F80ED]', tag: 'bg-[#2F80ED]/10 text-[#2F80ED]' },
  food:    { line: 'border-l-[#F2994A]', tag: 'bg-[#F2994A]/10 text-[#F2994A]' },
  stay:    { line: 'border-l-[#9B51E0]', tag: 'bg-[#9B51E0]/10 text-[#9B51E0]' },
  transit: { line: 'border-l-[#27AE60]', tag: 'bg-[#27AE60]/10 text-[#27AE60]' },
  booking: { line: 'border-l-[#EB5757]', tag: 'bg-[#EB5757]/10 text-[#EB5757]' },
  backup:  { line: 'border-l-[#8D99AE]', tag: 'bg-[#8D99AE]/10 text-[#8D99AE]' },
};

const getCategoryCardStyles = (cat: string, isSelected: boolean) => {
  const accent = CATEGORY_ACCENTS[cat] || CATEGORY_ACCENTS.backup;
  return {
    // Neutral surface only — selected = --bg-selected (#EEF6FF) + --accent-primary-line (#CFE2FF)
    bg: isSelected ? 'bg-[#EEF6FF]' : 'bg-white',
    border: isSelected ? 'border-[#CFE2FF]' : 'border-border-subtle',
    borderLeft: `border-l-4 ${accent.line}`,
    text: 'text-on-surface',
    labelBg: accent.tag,
  };
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
  readOnly?: boolean;
  onToggleReadMode?: () => void;
  onSelectItem: (id: string | undefined) => void;
  onHoverItem?: (id: string | undefined) => void;
  onSelectDay: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleLock: (id: string) => void;
  onAddItem: (item: Partial<ItineraryItem>) => void;
  onRemoveItem: (id: string) => void;
  onSetViewType: (type: 'day' | 'week' | 'month' | 'agenda') => void;
  onUpdateItemTime?: (id: string, newTime: string) => void;
  onPromotePocketItemToTime?: (placeItem: any, timeStr: string) => void;
  onMarkMissed?: (id: string) => void;
  onFindBestFit?: (id: string) => void;
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
  readOnly = false,
  onToggleReadMode,
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
  onMarkMissed,
  onFindBestFit,
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
  const [newDuration, setNewDuration] = useState(DEFAULT_DURATION);
  const [newCategory, setNewCategory] = useState<'sight' | 'food' | 'stay' | 'transit'>('sight');
  const [newArea, setNewArea] = useState('');

  // Pointer-driven drag state (move/create events, or slide a transit leg), snapped to 15 min.
  const gridRef = useRef<HTMLDivElement>(null);
  type DragState = {
    mode: 'move' | 'create' | 'transit';
    itemId?: string;
    segmentId?: string;
    startMin: number;
    durationMin: number;
    grabOffsetMin: number;
    anchorMin: number;
    minMin?: number;
    maxMin?: number;
    pointerStartY: number;
    moved: boolean;
  };
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<DragState | null>(null);

  // Per-leg transit overrides: chosen travel method + manual departure time (minutes since midnight).
  const [transitOverrides, setTransitOverrides] = useState<Record<string, { mode?: TravelMode; departMin?: number }>>({});
  const [openTransitMenu, setOpenTransitMenu] = useState<string | null>(null);

  const MAX_MINUTES = (END_HOUR + 1) * 60;

  // Convert a clientY pixel position into snapped minutes-since-midnight within the grid.
  const clientYToSnappedMinutes = (clientY: number): number => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return START_MINUTES;
    const raw = START_MINUTES + (clientY - rect.top) / MINUTE_HEIGHT;
    return Math.max(START_MINUTES, Math.min(MAX_MINUTES - SNAP_MINUTES, snapMinutes(raw)));
  };

  const handleGridDoubleClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    const snapped = clientYToSnappedMinutes(e.clientY);
    setNewTime(minutesToTimeString(snapped));
    setNewDuration(DEFAULT_DURATION);
    setShowAddForm(true);
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const raw = START_MINUTES + (e.clientY - rect.top) / MINUTE_HEIGHT;
    const moved = Math.abs(e.clientY - d.pointerStartY) > 4;
    let next: DragState;
    if (d.mode === 'move') {
      let start = snapMinutes(raw - d.grabOffsetMin);
      start = Math.max(START_MINUTES, Math.min(MAX_MINUTES - d.durationMin, start));
      next = { ...d, startMin: start, moved };
    } else if (d.mode === 'transit') {
      // Slide the travel block within the gap between the two stops.
      let depart = snapMinutes(raw - d.grabOffsetMin);
      depart = Math.max(d.minMin ?? START_MINUTES, Math.min(d.maxMin ?? START_MINUTES, depart));
      next = { ...d, startMin: depart, moved };
    } else {
      let cur = Math.max(START_MINUTES, Math.min(MAX_MINUTES, snapMinutes(raw)));
      const start = Math.min(d.anchorMin, cur);
      const end = Math.max(d.anchorMin + SNAP_MINUTES, cur);
      next = { ...d, startMin: start, durationMin: end - start, moved };
    }
    dragRef.current = next;
    setDragPreview(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    const d = dragRef.current;
    dragRef.current = null;
    setDragPreview(null);
    if (!d) return;
    if (d.mode === 'move') {
      if (d.moved && d.itemId) {
        onUpdateItemTime?.(d.itemId, minutesToTimeString(d.startMin));
      } else if (d.itemId) {
        onSelectItem(selectedItemId === d.itemId ? undefined : d.itemId);
      }
    } else if (d.mode === 'transit') {
      if (d.moved && d.segmentId) {
        const segId = d.segmentId;
        const departMin = d.startMin;
        setTransitOverrides(prev => ({ ...prev, [segId]: { ...prev[segId], departMin } }));
      }
    } else {
      if (d.moved) {
        setNewTime(minutesToTimeString(d.startMin));
        setNewDuration(d.durationMin);
        setShowAddForm(true);
      } else {
        onSelectItem(undefined);
      }
    }
  }, [handlePointerMove, onUpdateItemTime, onSelectItem, selectedItemId]);

  const startDrag = (state: DragState, e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = state;
    setDragPreview(state);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const handleMovePointerDown = (e: React.PointerEvent, item: ItineraryItem) => {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('button, a')) return; // let inner controls work
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const pointerMin = START_MINUTES + (e.clientY - rect.top) / MINUTE_HEIGHT;
    const startMin = parseTimeToMinutes(item.startTime);
    const durationMin = item.estimatedDurationMin || DEFAULT_DURATION;
    startDrag({
      mode: 'move',
      itemId: item.id,
      startMin,
      durationMin,
      grabOffsetMin: pointerMin - startMin,
      anchorMin: startMin,
      pointerStartY: e.clientY,
      moved: false,
    }, e);
  };

  const handleCreatePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    if (e.button !== 0 || !gridRef.current) return;
    const anchor = clientYToSnappedMinutes(e.clientY);
    startDrag({
      mode: 'create',
      startMin: anchor,
      durationMin: SNAP_MINUTES,
      grabOffsetMin: 0,
      anchorMin: anchor,
      pointerStartY: e.clientY,
      moved: false,
    }, e);
  };

  const handlePocketDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);
      const timeStr = minutesToTimeString(clientYToSnappedMinutes(e.clientY));
      if (data.type === 'pocket-item' && onPromotePocketItemToTime) {
        onPromotePocketItemToTime(data.item, timeStr);
      } else if (data.type === 'calendar-item' && onUpdateItemTime) {
        onUpdateItemTime(data.itemId, timeStr);
      }
    } catch (err) {
      console.error('Failed to parse dropped item:', err);
    }
  };

  // Begin sliding a transit leg's departure within its [earliest, latest] window.
  const handleTransitPointerDown = (
    e: React.PointerEvent,
    segmentId: string,
    departMin: number,
    minMin: number,
    maxMin: number,
  ) => {
    if (readOnly) return;
    if ((e.target as HTMLElement).closest('button, a')) return; // method switch / Navi link
    if (!gridRef.current || maxMin <= minMin) return; // no room to slide
    const rect = gridRef.current.getBoundingClientRect();
    const pointerMin = START_MINUTES + (e.clientY - rect.top) / MINUTE_HEIGHT;
    startDrag({
      mode: 'transit',
      segmentId,
      startMin: departMin,
      durationMin: 0,
      grabOffsetMin: pointerMin - departMin,
      anchorMin: departMin,
      minMin,
      maxMin,
      pointerStartY: e.clientY,
      moved: false,
    }, e);
  };

  const setTransitMode = (segmentId: string, mode: TravelMode) => {
    setTransitOverrides(prev => ({ ...prev, [segmentId]: { ...prev[segmentId], mode } }));
    setOpenTransitMenu(null);
  };

  const renderModeIcon = (mode: TravelMode, cls = 'w-3 h-3') => {
    switch (mode) {
      case 'walking': return <Footprints className={cls} />;
      case 'bicycling': return <Bike className={cls} />;
      case 'transit': return <Bus className={cls} />;
      default: return <Car className={cls} />;
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
    if (readOnly) return;
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

  const timedItems = currentDayItems
    .filter(item => !!item.startTime)
    .map(item => ({
      item,
      min: parseTimeToMinutes(item.startTime),
      dur: item.estimatedDurationMin || DEFAULT_DURATION,
    }))
    .sort((a, b) => a.min - b.min || a.dur - b.dur);

  // Column-packing layout (shared with the week grid) — overlapping events split the width.
  const positionedTimedItems = packEvents(timedItems);
  const orderedItems = [...positionedTimedItems].sort((a, b) => a.min - b.min);

  // Transit = MINIMUM travel time for the chosen method. The leg can be slid within the
  // gap between two stops (depart early to arrive early, or depart late to leave a buffer
  // for the previous stop running over). Leftover gap is just blank space — no fill.
  const transitSegments: {
    id: string;
    item1: ItineraryItem;
    item2: ItineraryItem;
    departMin: number;
    top: number;
    travelHeight: number;
    distance: string;
    distanceKm: number;
    durationMin: number;
    mode: TravelMode;
    gapMinutes: number;
    departMin: number;   // current departure (override or glued-to-prev default)
    minMin: number;      // earliest departure (prev event ends)
    maxMin: number;      // latest departure (arrive before next starts)
  }[] = [];

  for (let i = 0; i < orderedItems.length - 1; i++) {
    const current = orderedItems[i];
    const next = orderedItems[i + 1];

    const currentEndMin = current.min + current.dur;
    const gapMin = next.min - currentEndMin;
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
      estimatedDurationMin: newDuration,
      pinState: 'none'
    });

    setNewTitle('');
    setNewArea('');
    setNewDuration(DEFAULT_DURATION);
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
                <div className="absolute right-0 mt-1.5 w-36 bg-white border border-border-subtle rounded-xl shadow-lg py-1 z-50 animate-fadeIn text-xs">
                  {(['day', 'week', 'month', 'agenda'] as const).map(viewTypeOption => (
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
                      {VIEW_LABELS[viewTypeOption]}
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
                          <div className={`flex flex-col items-center gap-1.5 shrink-0 ml-1 ${readOnly ? 'hidden' : ''}`}>
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
              >
                {/* Time gutter + hour / quarter-hour grid lines */}
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, index) => {
                    const hour = index + START_HOUR;
                    const displayHour = hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
                    const y = index * HOUR_HEIGHT;
                    return (
                      <div key={hour}>
                        <span
                          className="absolute left-0 text-right text-[10px] font-bold text-slate-400 whitespace-nowrap -translate-y-1/2"
                          style={{ top: `${y}px`, width: `${GUTTER_PX - 8}px` }}
                        >
                          {displayHour}
                        </span>
                        {/* Solid hour line */}
                        <div className="absolute right-0 border-t border-slate-200/80" style={{ top: `${y}px`, left: `${GUTTER_PX}px` }} />
                        {/* Quarter-hour sublines (:30 slightly stronger / dashed) */}
                        {[15, 30, 45].map((m) => (
                          <div
                            key={m}
                            className={`absolute right-0 border-t ${m === 30 ? 'border-slate-200/60 border-dashed' : 'border-slate-100'}`}
                            style={{ top: `${y + m * MINUTE_HEIGHT}px`, left: `${GUTTER_PX}px` }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Interaction surface: double-click to add, click-drag to create, drop pocket items.
                    Sits beneath the (pointer-events-none) event layer so empty space stays interactive. */}
                <div
                  className="absolute top-0 bottom-0 right-0 cursor-cell"
                  style={{ left: `${GUTTER_PX}px` }}
                  onDoubleClick={handleGridDoubleClick}
                  onPointerDown={handleCreatePointerDown}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={handlePocketDrop}
                  title="Double-click to add, or drag to block out time"
                />

                {/* Live ghost while drag-creating a new time range */}
                {dragPreview?.mode === 'create' && (
                  <div
                    className="absolute right-0 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 pointer-events-none z-50 flex items-center justify-center"
                    style={{
                      left: `${GUTTER_PX}px`,
                      top: `${(dragPreview.startMin - START_MINUTES) * MINUTE_HEIGHT}px`,
                      height: `${Math.max(dragPreview.durationMin * MINUTE_HEIGHT, 16)}px`,
                    }}
                  >
                    <span className="text-[10px] font-bold text-primary bg-white/90 px-1.5 py-0.5 rounded shadow-sm">
                      {minutesToTimeString(dragPreview.startMin)} · {dragPreview.durationMin}m
                    </span>
                  </div>
                )}

                {/* Scheduled event chips — pointer-drag to move (15-min snap), column-packed when overlapping */}
                <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ left: `${GUTTER_PX}px` }}>
                  {positionedTimedItems.map(({ item, min, dur, colIndex, columnsCount }) => {
                    const isSelected = selectedItemId === item.id;
                    const isHovered = hoveredItemId === item.id;
                    const styles = getCategoryCardStyles(item.category, isSelected);
                    const isMovingThis = chipDrag?.itemId === item.id;
                    const isMovingOther = chipDrag !== null && !isMovingThis;
                    const isMissed = item.status === 'missed';
                    // While dragging, the chip follows the live snapped preview position.
                    const liveTop = isMovingThis
                      ? (chipDrag!.startMin - START_MINUTES_C) * MINUTE_HEIGHT
                      : Math.max(0, Math.min(top, (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT - height));

                    return (
                      <div
                        key={item.id}
                        onPointerDown={(e) => handleMovePointerDown(e, item)}
                        onClick={readOnly ? () => onSelectItem(isSelected ? undefined : item.id) : undefined}
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
                          isMissed ? 'opacity-60 saturate-50' : ''
                        } ${
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
                              <h3 className={`text-xs font-bold leading-tight ${styles.text} ${isMissed ? 'line-through decoration-slate-400/70' : ''}`}>
                                {item.title}
                              </h3>
                              {isMissed && (
                                <span className="inline-flex items-center gap-0.5 mt-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded px-1 py-px select-none">
                                  <CircleSlash className="w-2.5 h-2.5" /> missed
                                </span>
                              )}
                              {height >= 80 && item.note && (
                                <p className="text-[10px] italic text-blue-600 mt-1 leading-snug flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{item.note}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex items-center shrink-0 -mt-0.5 -mr-0.5">
                              {!isMissed && onMarkMissed && (
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); onMarkMissed(item.id); }}
                                  className="p-1 rounded-md hover:bg-black/5 opacity-0 group-hover:opacity-50 hover:!opacity-100 text-slate-500 hover:text-amber-600 transition-all cursor-pointer"
                                  title="Mark as missed"
                                >
                                  <CircleSlash className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveItem(item.id);
                                }}
                                className="p-1 rounded-md hover:bg-black/5 opacity-40 hover:opacity-100 text-slate-500 hover:text-red-500 transition-all cursor-pointer"
                                title="Remove stop"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex justify-between items-end gap-2 mt-1">
                            {isMissed && onFindBestFit ? (
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onFindBestFit(item.id); }}
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold transition-all cursor-pointer pointer-events-auto"
                                title="Find the best later day for this stop"
                              >
                                <Sparkles className="w-3 h-3 shrink-0" /> Find best fit
                              </button>
                            ) : (
                              <>
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
                                  onPointerDown={(e) => e.stopPropagation()}
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
                              </>
                            )}
                          </div>
                      </div>
                    );
                  })}
                </div>

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
                          <div
                            className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 bg-white border rounded-full shadow-sm text-xs select-none whitespace-nowrap ${capsuleColor} ${
                              isDraggingThis ? 'shadow-lg cursor-grabbing' : canSlide ? 'cursor-grab' : ''
                            }`}
                            title={canSlide ? 'Drag to depart earlier or later' : undefined}
                          >
                            {/* Method switch */}
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); if (!readOnly) setOpenTransitMenu(menuOpen ? null : segment.id); }}
                              className="flex items-center gap-0.5 rounded-full hover:bg-black/5 px-1 py-0.5 cursor-pointer"
                              title="Change travel method"
                            >
                              {renderModeIcon(segment.mode, 'w-3.5 h-3.5')}
                              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                            </button>
                            <span className="font-bold">{segment.durationMin}m</span>
                            <span className="opacity-40">·</span>
                            <span className="font-medium">{segment.distance}</span>
                            {isDraggingThis && <span className="font-semibold">· dep {minutesToTimeString(segment.departMin).replace(' ', '').toLowerCase()}</span>}
                            {!isDraggingThis && segment.status === 'tight' && <span className="font-bold">· tight</span>}
                            {!isDraggingThis && segment.status === 'overlap' && <span className="font-bold">· overlaps</span>}
                            <span className="opacity-40">·</span>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(segment.item1.formattedAddress || segment.item1.title)}&destination=${encodeURIComponent(segment.item2.formattedAddress || segment.item2.title)}&travelmode=${segment.mode}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              className="text-blue-500 hover:text-blue-600 font-bold hover:underline inline-flex items-center gap-0.5"
                              title="Open directions in Google Maps"
                            >
                              Navi <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>

                          {/* Method picker popover */}
                          {menuOpen && (
                            <>
                              <div className="fixed inset-0 z-40" onPointerDown={(e) => { e.stopPropagation(); setOpenTransitMenu(null); }} onClick={() => setOpenTransitMenu(null)} />
                              <div className="absolute top-full left-0 mt-1 z-50 w-32 bg-white border border-border-subtle rounded-xl shadow-lg py-1 animate-fadeIn">
                                {TRAVEL_MODES.map(m => {
                                  const mins = estimateTravelMinutes(segment.distanceKm, m);
                                  return (
                                    <button
                                      key={m}
                                      type="button"
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); setTransitMode(segment.id, m); }}
                                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-surface-container-low cursor-pointer ${
                                        segment.mode === m ? 'text-primary font-bold' : 'text-on-surface'
                                      }`}
                                    >
                                      {renderModeIcon(m, 'w-3.5 h-3.5')}
                                      <span className="flex-1 text-left">{TRAVEL_MODE_META[m].label}</span>
                                      <span className="text-tertiary">{mins}m</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

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
                        left: `${GUTTER_PX + 4}px`,
                        right: '4px',
                        zIndex: 100,
                      }}
                      className="pointer-events-auto bg-white border border-primary/30 p-2.5 rounded-xl flex flex-col gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)] text-on-surface animate-fadeIn"
                    >
                      <div className="flex justify-between items-center px-0.5">
                        <div className="text-[10px] font-bold text-primary flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          <span>Add Activity • {newTime} · {newDuration}m</span>
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
                      <div className="flex gap-2 text-[9px] font-semibold text-secondary items-center justify-between px-0.5">
                        <span>Duration:</span>
                        <div className="flex gap-1">
                          {[30, 60, 90, 120].map((d) => (
                            <button
                              type="button"
                              key={d}
                              onClick={() => setNewDuration(d)}
                              className={`px-1.5 py-0.5 rounded transition-all cursor-pointer border ${
                                newDuration === d
                                  ? 'bg-primary text-white border-primary shadow-sm'
                                  : 'bg-white border-border-subtle hover:bg-slate-50 text-secondary'
                              }`}
                            >
                              {d >= 60 ? `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`}
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

              {currentDayItems.length === 0 && (
                <div className="py-12 text-center absolute inset-0 bg-white/95 z-20 rounded-2xl flex flex-col justify-center items-center pointer-events-none">
                  <p className="text-secondary text-xs italic">No items scheduled for this day yet.</p>
                  <p className="text-[10px] text-tertiary mt-1">Double-click the grid to add a stop, or drag from the Pocket below.</p>
                </div>
              )}
            </div>


          </div>
        </div>
      )}

      {/* Week — true time-grid: shared hour scale, 7 day columns, category-styled chips */}
      {viewType === 'week' && (
        <div className="flex-grow flex flex-col overflow-hidden bg-white select-none">
          {/* Sticky day headers (aligned to the gutter) */}
          <div className="flex border-b border-border-subtle bg-white shrink-0">
            <div className="shrink-0" style={{ width: `${WEEK_GUTTER_PX}px` }} />
            <div className="flex-1 grid grid-cols-7">
              {days.map((day) => {
                const isCur = currentDay.id === day.id;
                const count = items.filter(i => i.dayId === day.id).length;
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => onSelectDay(day.id)}
                    className={`py-2 text-center border-r border-border-subtle last:border-r-0 cursor-pointer transition-colors ${
                      isCur ? 'bg-accent-soft' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <span className={`block text-[10px] font-bold ${isCur ? 'text-primary' : 'text-secondary'}`}>{day.label}</span>
                    <span className={`block text-sm font-extrabold leading-tight ${isCur ? 'text-primary' : 'text-on-surface'}`}>{day.date}</span>
                    {count > 0 && <span className="block mt-0.5 text-[8px] font-bold text-tertiary">{count} stop{count > 1 ? 's' : ''}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollable time grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex" style={{ height: `${(END_HOUR - START_HOUR + 1) * WEEK_HOUR_HEIGHT}px` }}>
              {/* Time gutter */}
              <div className="relative shrink-0" style={{ width: `${WEEK_GUTTER_PX}px` }}>
                {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => {
                  const hour = i + START_HOUR;
                  const disp = hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`;
                  return (
                    <span
                      key={hour}
                      className="absolute right-1.5 text-[9px] font-bold text-slate-400 -translate-y-1/2 whitespace-nowrap"
                      style={{ top: `${i * WEEK_HOUR_HEIGHT}px` }}
                    >
                      {disp}
                    </span>
                  );
                })}
              </div>

              {/* Day columns */}
              <div className="flex-1 grid grid-cols-7 relative">
                {/* Hour lines across all columns */}
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
                    <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: `${i * WEEK_HOUR_HEIGHT}px` }} />
                  ))}
                </div>

                {days.map((day) => {
                  const isCur = currentDay.id === day.id;
                  const packed = packEvents(
                    items
                      .filter(it => it.dayId === day.id && it.startTime)
                      .map(it => ({ item: it, min: parseTimeToMinutes(it.startTime), dur: it.estimatedDurationMin || DEFAULT_DURATION }))
                  );
                  return (
                    <div
                      key={day.id}
                      onClick={() => onSelectDay(day.id)}
                      onDoubleClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const raw = START_MINUTES + (e.clientY - rect.top) / WEEK_MINUTE_HEIGHT;
                        const snapped = Math.max(START_MINUTES, Math.min((END_HOUR + 1) * 60 - SNAP_MINUTES, snapMinutes(raw)));
                        onSelectDay(day.id);
                        setNewTime(minutesToTimeString(snapped));
                        setNewDuration(DEFAULT_DURATION);
                        setShowAddForm(true);
                        onSetViewType('day');
                      }}
                      className={`relative border-r border-border-subtle last:border-r-0 cursor-cell ${isCur ? 'bg-accent-soft/20' : 'hover:bg-slate-50/40'}`}
                      title="Double-click to add a stop on this day"
                    >
                      {packed.map(({ item, min, dur, colIndex, columnsCount }) => {
                        const isSel = selectedItemId === item.id;
                        const styles = getCategoryCardStyles(item.category, isSel);
                        const top = (min - START_MINUTES) * WEEK_MINUTE_HEIGHT;
                        const height = Math.max(dur * WEEK_MINUTE_HEIGHT, 13);
                        const colW = 100 / columnsCount;
                        return (
                          <div
                            key={item.id}
                            onClick={(e) => { e.stopPropagation(); onSelectItem(isSel ? undefined : item.id); onSelectDay(day.id); }}
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `calc(${colIndex * colW}% + 1px)`,
                              width: `calc(${colW}% - 2px)`,
                              zIndex: isSel ? 20 : 10 + colIndex,
                            }}
                            className={`rounded border overflow-hidden px-1 py-0.5 cursor-pointer transition-shadow ${styles.bg} ${styles.border} ${styles.borderLeft} ${
                              isSel ? 'ring-1 ring-primary/30 shadow' : 'shadow-sm hover:shadow'
                            }`}
                          >
                            <span className="block text-[8px] font-bold text-slate-500 tabular-nums truncate leading-none">
                              {item.startTime?.replace(' ', '').toLowerCase()}
                            </span>
                            <span className={`block text-[9px] font-bold leading-tight truncate ${styles.text}`}>{item.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
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
              const isTripDay = dayNum >= 12 && dayNum <= 18;
              const mappedDayId = isTripDay ? `day-${dayNum - 11}` : '';
              const isSelected = isTripDay && currentDay.id === mappedDayId;

              const dayItems = items
                .filter(item => item.dayId === mappedDayId)
                .sort((a, b) => parseTimeToMinutes(a.startTime || '') - parseTimeToMinutes(b.startTime || ''));
              const visible = dayItems.slice(0, 3);
              const moreCount = dayItems.length - visible.length;

              return (
                <div
                  key={dayNum}
                  onClick={() => { if (isTripDay) onSelectDay(mappedDayId); }}
                  onDoubleClick={() => { if (isTripDay) { onSelectDay(mappedDayId); onSetViewType('day'); } }}
                  className={`relative p-1.5 border-r border-b border-border-subtle min-h-[96px] flex flex-col gap-1 transition-all ${
                    isTripDay ? 'bg-accent-soft/60 hover:bg-accent-soft cursor-pointer' : 'bg-white hover:bg-bg-panel-hover'
                  } ${isSelected ? 'ring-2 ring-inset ring-primary z-10' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${isTripDay ? 'text-primary' : 'text-on-surface'}`}>{dayNum}</span>
                    {dayItems.length > 0 && (
                      <span className="text-[8px] font-bold text-tertiary bg-white/70 rounded px-1 leading-tight">{dayItems.length}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {visible.map(item => {
                      const styles = getCategoryCardStyles(item.category, false);
                      return (
                        <div
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isTripDay) { onSelectDay(mappedDayId); onSelectItem(item.id); }
                          }}
                          className={`px-1 py-0.5 rounded text-[8px] font-semibold truncate flex items-center gap-1 border ${styles.bg} ${styles.border} ${styles.borderLeft} hover:shadow-sm cursor-pointer`}
                          title={`${item.startTime || ''} ${item.title}`}
                        >
                          <span className="tabular-nums text-slate-500 shrink-0">{item.startTime?.split(' ')[0]}</span>
                          <span className={`truncate ${styles.text}`}>{item.title}</span>
                        </div>
                      );
                    })}
                    {moreCount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectDay(mappedDayId); onSetViewType('day'); }}
                        className="text-[8px] font-bold text-primary hover:underline text-left px-1 cursor-pointer"
                      >
                        +{moreCount} more
                      </button>
                    )}
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

      {/* Itinerary (Agenda) — the itinerary-first list: every day grouped, with travel + buffer hints */}
      {viewType === 'agenda' && (
        <div className="flex-grow overflow-y-auto custom-scrollbar bg-slate-50/30 select-none">
          <div className="p-3 space-y-4">
            {days.map((day) => {
              const dayItems = items
                .filter(i => i.dayId === day.id)
                .sort((a, b) => parseTimeToMinutes(a.startTime || '') - parseTimeToMinutes(b.startTime || ''));
              const timed = dayItems.filter(i => i.startTime);
              const flexible = dayItems.filter(i => !i.startTime);
              const isCur = currentDay.id === day.id;

              return (
                <div key={day.id}>
                  {/* Sticky day header — Tier 3 date + Tier 5 area summary (calendar column rules) */}
                  <button
                    type="button"
                    onClick={() => onSelectDay(day.id)}
                    className={`sticky top-0 z-10 w-full flex items-center justify-between px-3 py-2 rounded-lg mb-2 backdrop-blur bg-white/90 border cursor-pointer transition-colors ${
                      isCur ? 'border-primary/40 shadow-sm' : 'border-border-subtle hover:border-primary/20'
                    }`}
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className={`text-sm font-semibold shrink-0 ${isCur ? 'text-primary' : 'text-on-surface'}`}>
                        {getShortDateString(day.fullDateString)}
                      </span>
                      {day.areaSummary && <span className="text-[13px] text-secondary font-medium truncate">{day.areaSummary}</span>}
                    </div>
                    <span className="text-xs font-medium text-tertiary shrink-0">
                      {dayItems.length} stop{dayItems.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {dayItems.length === 0 && (
                    <p className="text-xs text-tertiary italic px-3 pb-2">No stops planned for this day.</p>
                  )}

                  <div className="space-y-2">
                    {timed.map((item, idx) => {
                      const isSel = selectedItemId === item.id;
                      const styles = getCategoryCardStyles(item.category, isSel);
                      const next = timed[idx + 1];
                      let transit: { durationMin: number; distance: string; buffer: number } | null = null;
                      if (next) {
                        const est = getDistanceAndDuration(item, next);
                        if (est) {
                          const gap = parseTimeToMinutes(next.startTime) - (parseTimeToMinutes(item.startTime) + (item.estimatedDurationMin || DEFAULT_DURATION));
                          transit = { durationMin: est.durationMin, distance: est.distance, buffer: gap - est.durationMin };
                        }
                      }

                      return (
                        <React.Fragment key={item.id}>
                          {/* PlanChip — neutral surface, 14px radius, 12px padding, ≥72px, category = left accent only */}
                          <div
                            onClick={() => { onSelectItem(isSel ? undefined : item.id); onSelectDay(day.id); }}
                            className={`flex gap-3 p-3 min-h-[72px] rounded-[14px] border cursor-pointer transition-colors ${styles.bg} ${styles.borderLeft} ${
                              isSel ? 'border-[#CFE2FF] shadow-md' : 'border-border-subtle hover:border-primary/20'
                            }`}
                          >
                            <div className="w-14 shrink-0 text-right">
                              <div className="text-xs font-semibold text-on-surface tabular-nums leading-tight">{item.startTime}</div>
                              {item.estimatedDurationMin && <div className="text-xs text-tertiary mt-0.5">{item.estimatedDurationMin}m</div>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-on-surface truncate">{item.title}</h4>
                              <p className="text-xs font-medium text-secondary truncate mt-0.5">
                                {item.area}{item.budget ? ` · ${item.budget}` : ''}
                              </p>
                              {item.note && (
                                <p className="text-xs text-tertiary mt-1 truncate flex items-center gap-1">
                                  <ShieldCheck className="w-3 h-3 shrink-0" />{item.note}
                                </p>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center">
                              {item.pinState === 'hard'
                                ? <Lock className="w-4 h-4 text-[#1F6FD6]" />
                                : item.pinState === 'soft'
                                ? <PushPinIcon pinned />
                                : null}
                            </div>
                          </div>
                          {transit && (
                            <div className="flex items-center gap-1.5 pl-[4.75rem] py-1 text-xs text-secondary">
                              <Car className="w-3.5 h-3.5 shrink-0 text-tertiary" />
                              <span className="font-medium">{transit.durationMin}m · {transit.distance}</span>
                              {transit.buffer < 0 && <span className="text-[#D48A00] font-semibold">· tight {Math.abs(transit.buffer)}m</span>}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {flexible.map((item) => {
                      const isSel = selectedItemId === item.id;
                      const styles = getCategoryCardStyles(item.category, isSel);
                      return (
                        <div
                          key={item.id}
                          onClick={() => { onSelectItem(isSel ? undefined : item.id); onSelectDay(day.id); }}
                          className={`flex gap-3 p-3 min-h-[72px] rounded-[14px] border cursor-pointer transition-colors ${styles.bg} ${styles.borderLeft} ${
                            isSel ? 'border-[#CFE2FF] shadow-md' : 'border-border-subtle hover:border-primary/20'
                          }`}
                        >
                          <div className="w-14 shrink-0 text-right text-xs font-semibold text-tertiary uppercase pt-0.5">Flex</div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-semibold text-on-surface truncate">{item.title}</h4>
                            <p className="text-xs font-medium text-secondary truncate mt-0.5">{item.area}{item.budget ? ` · ${item.budget}` : ''}</p>
                          </div>
                          <div className="shrink-0 flex items-center">
                            {item.pinState === 'hard' ? <Lock className="w-4 h-4 text-[#1F6FD6]" /> : item.pinState === 'soft' ? <PushPinIcon pinned /> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

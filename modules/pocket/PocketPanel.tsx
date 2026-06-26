/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { Plus, Compass, Coffee, ListChecks, PlusCircle, Filter, Search, X, MapPin, Star, Clock, Tag, ChevronDown, Check, ArrowUpDown, Layers } from 'lucide-react';
import { PocketColumn, PlaceItem } from '@/shared/types/index';
import GooglePlaceDetailsCard from '@/shared/utils/GooglePlaceDetailsCard';
// 5-intent display taxonomy (See/Eat/Do/Stay/Transit) + status tags (Booked/Backup) —
// consolidation per OTA practice, stress-tested before adoption; legacy contract untouched.
import { displayCategory, statusTags, DISPLAY_CAT_LABEL } from './taxonomy';
// Reuse the shared geo primitive rather than reinventing distance (now promoted to shared/utils
// per #12, so this is no longer a cross-module import into the constraint engine).
import { haversineKm } from '@/shared/utils/geo';

// Two-sided range bar (min + max thumbs over one track) — used for the Budget and Rating filters.
function RangeBar({ min, max, step, lo, hi, onChange }: {
  min: number; max: number; step: number; lo: number; hi: number; onChange: (v: [number, number]) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div className="relative h-4 flex items-center">
      <style>{`
        .pp-range{position:absolute;left:0;right:0;width:100%;height:100%;margin:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none;}
        .pp-range:focus{outline:none;}
        .pp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;pointer-events:auto;height:14px;width:14px;border-radius:9999px;background:#005ab6;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer;}
        .pp-range::-moz-range-thumb{pointer-events:auto;height:14px;width:14px;border-radius:9999px;background:#005ab6;border:2px solid #fff;cursor:pointer;}
      `}</style>
      <div className="absolute left-0 right-0 h-1 rounded-full bg-[#E4E2DE]" />
      <div className="absolute h-1 rounded-full bg-primary" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
      <input type="range" className="pp-range" min={min} max={max} step={step} value={lo}
        onChange={e => onChange([Math.min(Number(e.target.value), hi), hi])} />
      <input type="range" className="pp-range" min={min} max={max} step={step} value={hi}
        onChange={e => onChange([lo, Math.max(Number(e.target.value), lo)])} />
    </div>
  );
}


interface PocketPanelProps {
  pocket: PocketColumn[];
  onAddPocketItem: (columnId: string, item: PlaceItem) => void;
  onPromoteItem: (item: PlaceItem) => void;
  onClearAll: () => void;
  onRemovePocketItem?: (itemId: string) => void;
  selectedItemId?: string;
  onSelectItem?: (id: string | undefined) => void;
  onDropCalendarItem?: (itemId: string, targetColumnId: string) => void;
  /** Items scheduled on the focused day — their real areas/coords drive relevance ranking. */
  focusedDayItems?: PlaceItem[];
  /** Focused day's theme (areaSummary) — a weak fallback signal when the day is still empty. */
  focusedDayArea?: string;
  /** Label of the focused day (e.g. "Wed 14") for the relevance chip. */
  focusedDayLabel?: string;
  /** Live map zoom — drives the adaptive granularity of "Group by Area". */
  mapZoom?: number;
}

export default function PocketPanel({ 
  pocket, 
  onAddPocketItem, 
  onPromoteItem, 
  onClearAll,
  onRemovePocketItem,
  selectedItemId,
  onSelectItem,
  onDropCalendarItem,
  focusedDayItems,
  focusedDayArea,
  focusedDayLabel,
  mapZoom
}: PocketPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // empty = all
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);             // empty = all
  const [regionQuery, setRegionQuery] = useState('');                          // free-text area/region filter
  const [sortBy, setSortBy] = useState<'name' | 'rating' | 'category' | 'area'>('name');
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'area'>('category');
  const [openMenu, setOpenMenu] = useState<'sort' | 'filter' | null>(null);
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [expandedCats, setExpandedCats] = useState<string[]>([]); // which categories show their sub-cats
  const RATING_MAX = 5;
  const BUDGET_MAX = 3; // 0=free, then symbol count (¥/¥¥/¥¥¥ · $$/$$$)
  const [ratingRange, setRatingRange] = useState<[number, number]>([0, RATING_MAX]);
  const [budgetRange, setBudgetRange] = useState<[number, number]>([0, BUDGET_MAX]);
  const budgetRank = (b?: string) => (!b || /free/i.test(b)) ? 0 : Math.min(BUDGET_MAX, (b.match(/[¥$]/g) || []).length);
  const BUDGET_LABEL = ['Free', '$', '$$', '$$$'];

  const SORT_LABEL: Record<string, string> = { name: 'Name', rating: 'Rating', category: 'Category', area: 'Area' };
  const GROUP_LABEL: Record<string, string> = { none: 'None', category: 'Category', area: 'Area' };
  const catLabel = (c: string) => (DISPLAY_CAT_LABEL as Record<string, string>)[c] || c.charAt(0).toUpperCase() + c.slice(1);
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  // Relevance to the focused day. Geo proximity is a POSITIVE signal (a near hit), OR'd with
  // area/word overlap — never used to NEGATE. So whole-degree normalized/placeholder coords
  // (always >100km apart, never within NEAR_KM) simply don't geo-match and fall through to the
  // area tokens, while real-world coords (Iceland, Europe, the Americas — any |lng| ≤ 180) get
  // true proximity ranking.
  const tokenize = (s?: string) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  // Plain coordinate validity — NO longitude magic number. Real vs normalized-placeholder coords
  // can't be told apart by value ((40,35) is both a valid lat/lng and a mock), so we don't try;
  // the normalized-seed problem is being removed by the constraint-engine real-coords migration.
  const isGeo = (p?: { lat?: number; lng?: number }) =>
    !!p && p.lat != null && p.lng != null && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  const NEAR_KM = 3;

  const dayItems = focusedDayItems || [];
  // Reference area vocabulary: the day's actual scheduled stops' areas, plus the theme as a weak hint.
  const refTokens = new Set<string>();
  for (const it of dayItems) tokenize(`${it.group || ''} ${it.area || ''}`).forEach(t => refTokens.add(t));
  tokenize(focusedDayArea).forEach(t => refTokens.add(t));
  // Geo centroid from the day's stops that carry coordinates.
  const geoPts = dayItems.filter(isGeo);
  const centroid = geoPts.length
    ? { lat: geoPts.reduce((s, p) => s + (p.lat as number), 0) / geoPts.length,
        lng: geoPts.reduce((s, p) => s + (p.lng as number), 0) / geoPts.length }
    : null;

  const hasFocus = refTokens.size > 0 || centroid != null;
  const isRelevant = (item: PlaceItem) => {
    // Positive geo hit: within NEAR_KM of the day's centroid (only fires for real-distance coords).
    if (centroid && isGeo(item)) {
      const km = haversineKm(item, centroid);
      if (km != null && km <= NEAR_KM) return true;
    }
    // Otherwise fall through to the day's area vocabulary (covers normalized/coordless items).
    if (!refTokens.size) return false;
    const hay = tokenize(`${item.group || ''} ${item.area || ''}`);
    return hay.some(t => refTokens.has(t));
  };
  const [showAddView, setShowAddView] = useState(false);
  
  // Add Place States
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSearchResults, setPlaceSearchResults] = useState<Partial<PlaceItem>[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    category: 'sight' as PlaceItem['category'],
    area: '',
    subCategory: '',
    budget: '',
    openingHours: ''
  });

  const handleSearchPlaces = () => {
    if (!addSearchQuery.trim()) return;
    setIsSearchingPlaces(true);
    
    // Simulate Google Maps Search
    setTimeout(() => {
      const results: Partial<PlaceItem>[] = [
        {
          title: addSearchQuery,
          category: 'sight',
          area: 'Kyoto, Japan',
          subCategory: 'Sightseeing',
          rating: 4.8,
          imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=300&auto=format&fit=crop'
        },
        {
          title: `${addSearchQuery} Garden`,
          category: 'sight',
          area: 'Sakyo Ward, Kyoto',
          subCategory: 'Park',
          rating: 4.5,
          imageUrl: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?q=80&w=300&auto=format&fit=crop'
        }
      ];
      setPlaceSearchResults(results);
      setIsSearchingPlaces(false);
    }, 800);
  };

  const handleAddFoundPlace = (place: Partial<PlaceItem>) => {
    const columnId = place.category === 'food' ? 'food-drink' : 'must-see';
    const newItem: PlaceItem = {
      id: 'place-' + Math.random().toString(36).substring(2, 9),
      title: place.title || 'New Place',
      category: place.category as any || 'sight',
      area: place.area || 'Kyoto',
      imageUrl: place.imageUrl,
      rating: place.rating,
      subCategory: place.subCategory,
      budget: place.budget || '$$',
      openingHours: place.openingHours || '9:00 AM - 5:00 PM'
    };
    onAddPocketItem(columnId, newItem);
    setShowAddView(false);
    setAddSearchQuery('');
    setPlaceSearchResults([]);
  };

  const handleManualAdd = () => {
    if (!manualForm.title) return;
    const columnId = manualForm.category === 'food' ? 'food-drink' : 'must-see';
    const newItem: PlaceItem = {
      id: 'place-' + Math.random().toString(36).substring(2, 9),
      ...manualForm
    };
    onAddPocketItem(columnId, newItem);
    setShowAddView(false);
    setShowManualForm(false);
    setManualForm({ title: '', category: 'sight', area: '', subCategory: '', budget: '', openingHours: '' });
  };

  // Adaptive facets — categories present in the data (with counts) and the sub-categories
  // available WITHIN the currently selected categories, so the sub filter stays specific.
  const facets = useMemo(() => {
    const all = pocket.flatMap(c => c.items);
    const cats = new Map<string, number>();
    const subsByCat = new Map<string, Map<string, number>>();
    for (const it of all) {
      const dc = displayCategory(it); // 5-intent display category, not the legacy union
      cats.set(dc, (cats.get(dc) || 0) + 1);
      if (it.subCategory) {
        const m = subsByCat.get(dc) ?? subsByCat.set(dc, new Map()).get(dc)!;
        m.set(it.subCategory, (m.get(it.subCategory) || 0) + 1);
      }
    }
    const sortMap = <K,>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { total: all.length, cats: sortMap(cats), subsByCat };
  }, [pocket]);
  const budgetActive = budgetRange[0] > 0 || budgetRange[1] < BUDGET_MAX;
  const ratingActive = ratingRange[0] > 0 || ratingRange[1] < RATING_MAX;
  const activeFilters = selectedCategories.length + selectedSubs.length + (budgetActive ? 1 : 0) + (ratingActive ? 1 : 0) + (regionQuery.trim() ? 1 : 0);

  const allItems = useMemo(() => {
    let filtered = pocket.flatMap(col => col.items);
    if (selectedCategories.length) filtered = filtered.filter(it => selectedCategories.includes(displayCategory(it)));
    if (selectedSubs.length) filtered = filtered.filter(it => it.subCategory != null && selectedSubs.includes(it.subCategory));
    if (ratingActive) filtered = filtered.filter(it => { const r = it.rating ?? 0; return r >= ratingRange[0] && r <= ratingRange[1]; });
    if (budgetActive) filtered = filtered.filter(it => { const b = budgetRank(it.budget); return b >= budgetRange[0] && b <= budgetRange[1]; });
    if (regionQuery.trim()) {
      const rq = regionQuery.toLowerCase().trim();
      filtered = filtered.filter(it => (it.area || '').toLowerCase().includes(rq) || (it.group || '').toLowerCase().includes(rq));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(it =>
        it.title.toLowerCase().includes(q) ||
        (it.area || '').toLowerCase().includes(q) ||
        (it.subCategory || '').toLowerCase().includes(q));
    }
    if (onlyRelevant && hasFocus) filtered = filtered.filter(isRelevant);

    return [...filtered].sort((a, b) => {
      if (hasFocus && !onlyRelevant) {
        const ra = isRelevant(a) ? 0 : 1, rb = isRelevant(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'category') return displayCategory(a).localeCompare(displayCategory(b)) || a.title.localeCompare(b.title);
      if (sortBy === 'area') return (a.area || '').localeCompare(b.area || '') || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
  }, [pocket, selectedCategories, selectedSubs, regionQuery, ratingRange, budgetRange, searchQuery, sortBy, onlyRelevant, hasFocus, focusedDayArea, focusedDayItems]);

  // "Group by Area" follows the map's zoom: a coarse grid (region) when zoomed out collapses to a
  // fine grid (district/block) when zoomed in — so the list and map sit at the same geographic
  // scale. Items without real coordinates fall back to their area string.
  const cellForZoom = (z: number) => z < 4 ? 12 : z < 6 ? 3 : z < 8 ? 1 : z < 10 ? 0.3 : z < 12 ? 0.08 : 0.02;
  const areaTier = (z?: number) => z == null ? 'Area' : z < 4 ? 'Region' : z < 6 ? 'State / Province' : z < 8 ? 'Province' : z < 10 ? 'City' : z < 12 ? 'District' : 'Block';
  const dominantArea = (items: PlaceItem[]) => {
    const f = new Map<string, number>();
    for (const it of items) { const a = (it.group || it.area || '').trim(); if (a) f.set(a, (f.get(a) || 0) + 1); }
    let best = 'Unsorted', n = 0;
    for (const [k, v] of f) if (v > n) { best = k; n = v; }
    return best;
  };

  // Vertical sections, grouped by the chosen dimension (or one flat list). Scales to hundreds.
  const displayColumns = useMemo(() => {
    if (groupBy === 'none') return [{ id: 'all', title: 'All saved', items: allItems }];
    const cell = groupBy === 'area' && mapZoom != null ? cellForZoom(mapZoom) : null;
    const keyOf = (it: PlaceItem) =>
      groupBy === 'category' ? catLabel(displayCategory(it))
      : (cell != null && isGeo(it))
        ? `${Math.floor((it.lng as number) / cell)}:${Math.floor((it.lat as number) / cell)}`
        : (it.group || it.area || 'Unsorted');
    const map = new Map<string, PlaceItem[]>();
    for (const it of allItems) { const k = keyOf(it) || 'Unsorted'; (map.get(k) ?? map.set(k, []).get(k)!).push(it); }
    return [...map.entries()]
      .map(([id, items]) => ({ id, title: groupBy === 'area' ? dominantArea(items) : id, items }))
      .sort((a, b) => {
        const aFallback = a.title === 'Unsorted' || a.title === 'Uncategorized';
        const bFallback = b.title === 'Unsorted' || b.title === 'Uncategorized';
        if (aFallback !== bFallback) return aFallback ? 1 : -1;
        const ar = hasFocus && a.items.some(isRelevant) ? 0 : 1;
        const br = hasFocus && b.items.some(isRelevant) ? 0 : 1;
        if (ar !== br) return ar - br;
        return b.items.length - a.items.length;
      });
  }, [allItems, groupBy, hasFocus, mapZoom]);

  return (
    <section className="flex-1 bg-white border border-border-subtle rounded-[8px] overflow-hidden shadow-sm flex flex-col min-h-[160px]">
      {/* Bucket List Main Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex items-center gap-2 bg-white shrink-0 relative">
        <div className="flex items-center gap-1.5 shrink-0">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-on-surface">Bucket List</h2>
        </div>

        <div className="flex-1 relative min-w-0">
          <Search className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search saved places"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 bg-[#F7F6F2] border border-[#E4E2DE] focus:border-primary/60 rounded-[8px] text-xs outline-none focus:ring-1 focus:ring-primary transition-all font-medium text-on-surface placeholder:text-[#6A7470]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface p-0.5"><X className="w-3 h-3" /></button>
          )}
        </div>

        {hasFocus && (
          <button onClick={() => setOnlyRelevant(v => !v)} title={`Only spots relevant to ${focusedDayLabel || 'this day'}`}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${onlyRelevant ? 'bg-primary text-white border-primary' : 'bg-white text-secondary border-[#E4E2DE] hover:bg-[#F7F6F2]'}`}>
            <MapPin className="w-3.5 h-3.5" /><span className="hidden lg:inline">{focusedDayLabel || 'This day'}</span>
          </button>
        )}

        {/* Add (blue) */}
        <button onClick={() => setShowAddView(!showAddView)} title="Add a place"
          className="p-1.5 rounded-lg border border-primary bg-primary text-white hover:bg-accent-primary-hover shadow-sm transition-all cursor-pointer shrink-0">
          <Plus className={`w-4 h-4 transition-transform ${showAddView ? 'rotate-45' : ''}`} />
        </button>

        {/* Sort (icon only) */}
        <div className="relative shrink-0">
          <button onClick={() => setOpenMenu(openMenu === 'sort' ? null : 'sort')} title={`Sort: ${SORT_LABEL[sortBy]}`}
            className={`p-1.5 rounded-lg border bg-white transition-all cursor-pointer ${openMenu === 'sort' ? 'border-primary text-primary' : 'border-[#E4E2DE] text-secondary hover:bg-[#F7F6F2]'}`}>
            <ArrowUpDown className="w-4 h-4" />
          </button>
          {openMenu === 'sort' && (
            <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-border-subtle rounded-xl shadow-xl z-30 py-1 animate-fadeIn">
              {(['name', 'rating', 'category', 'area'] as const).map(s => (
                <button key={s} onClick={() => { setSortBy(s); setOpenMenu(null); }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#F7F6F2] cursor-pointer ${sortBy === s ? 'text-primary font-bold' : 'text-on-surface-variant font-medium'}`}>
                  {SORT_LABEL[s]} {sortBy === s && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter (icon only · dot when active) */}
        <div className="relative shrink-0">
          <button onClick={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')} title="Filter"
            className={`relative p-1.5 rounded-lg border bg-white transition-all cursor-pointer ${activeFilters || openMenu === 'filter' ? 'border-primary text-primary' : 'border-[#E4E2DE] text-secondary hover:bg-[#F7F6F2]'}`}>
            <Filter className="w-4 h-4" />
            {activeFilters > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border border-white" />}
          </button>
          {openMenu === 'filter' && (
            <div className="absolute right-0 top-full mt-1.5 w-[22rem] max-w-[calc(100vw-1rem)] max-h-[72vh] overflow-y-auto custom-scrollbar bg-white border border-border-subtle rounded-xl shadow-xl z-30 p-3 animate-fadeIn">
              <div className="grid grid-cols-2 gap-x-3 items-start">
                {/* LEFT — Region, Budget, Rating, Group by */}
                <div className="flex flex-col gap-3 min-w-0 border-r border-border-subtle pr-3">
                  {/* Region — free-text (no list) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 h-4">
                      <span className="text-[10px] font-bold text-[#6A7470] uppercase tracking-wider">Region</span>
                    </div>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-secondary absolute left-2 top-1/2 -translate-y-1/2" />
                      <input type="text" value={regionQuery} onChange={(e) => setRegionQuery(e.target.value)} placeholder="e.g. Kyoto…"
                        className="w-full pl-7 pr-7 py-1.5 bg-[#F7F6F2] border border-[#E4E2DE] focus:border-primary/60 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary font-medium text-on-surface placeholder:text-[#6A7470]" />
                      {regionQuery && <button onClick={() => setRegionQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface p-0.5"><X className="w-3 h-3" /></button>}
                    </div>
                  </div>

                  {/* Budget */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-1">
                      <span className="text-[10px] font-bold text-[#6A7470] uppercase tracking-wider">Budget</span>
                      <span className="text-[10px] font-bold text-on-surface-variant truncate">{BUDGET_LABEL[budgetRange[0]]}–{BUDGET_LABEL[budgetRange[1]]}</span>
                    </div>
                    <RangeBar min={0} max={BUDGET_MAX} step={1} lo={budgetRange[0]} hi={budgetRange[1]} onChange={setBudgetRange} />
                  </div>

                  {/* Rating */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-1">
                      <span className="text-[10px] font-bold text-[#6A7470] uppercase tracking-wider">Rating</span>
                      <span className="text-[10px] font-bold text-on-surface-variant flex items-center gap-0.5">{ratingRange[0].toFixed(1)}–{ratingRange[1].toFixed(1)}<Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /></span>
                    </div>
                    <RangeBar min={0} max={RATING_MAX} step={0.5} lo={ratingRange[0]} hi={ratingRange[1]} onChange={setRatingRange} />
                  </div>

                  {/* Group by */}
                  <div>
                    <span className="text-[10px] font-bold text-[#6A7470] uppercase tracking-wider flex items-center gap-1"><Layers className="w-3 h-3" /> Group by</span>
                    <div className="flex gap-1 mt-1.5">
                      {(['none', 'category', 'area'] as const).map(g => (
                        <button key={g} onClick={() => setGroupBy(g)} className={`flex-1 px-0.5 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer ${groupBy === g ? 'bg-primary text-white' : 'bg-[#F7F6F2] text-secondary hover:bg-[#EDEBE7]'}`}>
                          {GROUP_LABEL[g]}
                        </button>
                      ))}
                    </div>
                    {groupBy === 'area' && (
                      <p className="text-[10px] text-secondary mt-1.5">Follows map zoom — <span className="font-bold text-on-surface-variant">{areaTier(mapZoom)}</span>.</p>
                    )}
                  </div>
                </div>

                {/* RIGHT — Category (each row expands to its sub-categories) */}
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center justify-between mb-1.5 h-4">
                    <span className="text-[10px] font-bold text-[#6A7470] uppercase tracking-wider">Category</span>
                    {(selectedCategories.length > 0 || selectedSubs.length > 0) && (
                      <button onClick={() => { setSelectedCategories([]); setSelectedSubs([]); }} className="text-[10px] font-bold text-primary hover:underline cursor-pointer">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto custom-scrollbar -mr-1 pr-1">
                    {facets.cats.map(([cat, count]) => {
                      const on = selectedCategories.includes(cat);
                      const subs = [...(facets.subsByCat.get(cat) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
                      const expanded = expandedCats.includes(cat);
                      return (
                        <div key={cat}>
                          <div className="flex items-center gap-1 px-1 py-1 rounded-md hover:bg-[#F7F6F2]">
                            <button onClick={() => toggle(selectedCategories, cat, setSelectedCategories)} className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer">
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>{on && <Check className="w-2.5 h-2.5" />}</span>
                              <span className="text-xs font-medium text-on-surface truncate">{catLabel(cat)}</span>
                            </button>
                            <span className="text-[10px] text-secondary font-bold shrink-0">{count}</span>
                            {subs.length > 0 && (
                              <button onClick={() => toggle(expandedCats, cat, setExpandedCats)} title="Show sub-categories" className="text-secondary hover:text-on-surface cursor-pointer shrink-0">
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                          {expanded && subs.length > 0 && (
                            <div className="ml-4 flex flex-col gap-0.5 border-l border-border-subtle pl-2 py-0.5">
                              {subs.map(([sub, sc]) => {
                                const son = selectedSubs.includes(sub);
                                return (
                                  <button key={sub} onClick={() => toggle(selectedSubs, sub, setSelectedSubs)} className="flex items-center justify-between gap-1 px-1 py-0.5 rounded hover:bg-[#F7F6F2] cursor-pointer">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 ${son ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>{son && <Check className="w-2 h-2" />}</span>
                                      <span className="text-[11px] text-on-surface-variant truncate">{sub}</span>
                                    </span>
                                    <span className="text-[10px] text-secondary font-bold shrink-0">{sc}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {openMenu && <div className="fixed inset-0 z-20" onClick={() => setOpenMenu(null)} />}
      </div>


      {/* Add Place Overlay */}
      {showAddView && (
        <div className="mx-3 my-2 p-3 bg-primary-soft shadow-sm rounded-xl border border-primary/20 animate-fadeIn shrink-0">
          {!showManualForm ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Search Google Maps
                </h3>
                <button onClick={() => setShowManualForm(true)} className="text-[10px] font-bold text-primary underline cursor-pointer">
                  Add manually
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter place name..."
                  value={addSearchQuery}
                  onChange={(e) => setAddSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchPlaces()}
                  className="w-full pl-3 pr-10 py-2 bg-white border border-primary/30 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-medium text-on-surface"
                  autoFocus
                />
                <button 
                  onClick={handleSearchPlaces}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-primary p-1 hover:bg-primary/10 rounded-md transition-colors cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
              
              {isSearchingPlaces && (
                <div className="py-4 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] font-medium text-primary/60">Searching Kyoto...</span>
                </div>
              )}
              
              {placeSearchResults.length > 0 && !isSearchingPlaces && (
                <div className="flex flex-col gap-1.5 mt-1 border-t border-primary/10 pt-2">
                  {placeSearchResults.map((place, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center gap-2 p-2 bg-white hover:bg-[#F7F6F2] border border-[#E4E2DE] rounded-lg cursor-pointer transition-all group"
                      onClick={() => handleAddFoundPlace(place)}
                    >
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-100 shrink-0">
                        <img src={place.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate leading-tight">{place.title}</p>
                        <p className="text-[10px] text-[#6A7470] font-medium truncate">{place.area}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                         <div className="flex items-center gap-0.5 text-amber-500 font-bold text-[10px]">
                            <Star className="w-2.5 h-2.5 fill-amber-500" /> {place.rating}
                         </div>
                         <PlusCircle className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-primary flex items-center gap-1">
                  <PlusCircle className="w-3 h-3" /> Manual Place Entry
                </h3>
                <button onClick={() => setShowManualForm(false)} className="text-[10px] font-bold text-primary underline cursor-pointer">
                   Back to search
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[9px] font-bold text-[#6A7470] uppercase tracking-wider mb-1 block">Place Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Kinkaku-ji"
                    value={manualForm.title}
                    onChange={(e) => setManualForm({...manualForm, title: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-[#6A7470] uppercase tracking-wider mb-1 block">Category</label>
                  <select 
                    value={manualForm.category}
                    onChange={(e) => setManualForm({...manualForm, category: e.target.value as any})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                  >
                    <option value="sight">Sightseeing</option>
                    <option value="food">Food & Drink</option>
                    <option value="stay">Stay</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-[#6A7470] uppercase tracking-wider mb-1 block">Area</label>
                  <input
                    type="text"
                    placeholder="e.g., Kyoto"
                    value={manualForm.area}
                    onChange={(e) => setManualForm({...manualForm, area: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-[#6A7470] uppercase tracking-wider mb-1 block">Tags / Sub</label>
                  <input
                    type="text"
                    placeholder="e.g., Temple"
                    value={manualForm.subCategory}
                    onChange={(e) => setManualForm({...manualForm, subCategory: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-[#6A7470] uppercase tracking-wider mb-1 block">Opening Hours</label>
                  <input
                    type="text"
                    placeholder="e.g., 9AM - 5PM"
                    value={manualForm.openingHours}
                    onChange={(e) => setManualForm({...manualForm, openingHours: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
              </div>
              
              <button 
                onClick={handleManualAdd}
                disabled={!manualForm.title}
                className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-accent-primary-hover transition-colors shadow-sm disabled:opacity-50"
              >
                Add to Bucket List
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="@container flex-1 bg-bg-panel-muted px-2 pb-2 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col gap-2 min-h-full">
          {displayColumns.map((col) => {
            return (
              <div
                key={col.id}
                className="flex flex-col gap-1 rounded-2xl border border-transparent transition-all duration-150"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add('bg-slate-100/50', 'border-slate-300/40', 'border-dashed');
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('bg-slate-100/50', 'border-slate-300/40', 'border-dashed');
                }}
                onDrop={(e) => {
                  e.currentTarget.classList.remove('bg-slate-100/50', 'border-slate-300/40', 'border-dashed');
                  try {
                    const dataStr = e.dataTransfer.getData('application/json');
                    if (dataStr) {
                      const data = JSON.parse(dataStr);
                      if (data.type === 'calendar-item' && onDropCalendarItem) {
                        // In Area/Day view the columns are dynamic (id "area:..."), not real
                        // storage columns — route the dropped item to its category column instead.
                        // Groups are dynamic (id = group label), not storage columns — route the
                        // dropped item to its category's storage column.
                        const targetId = data.item?.category === 'food' ? 'food-drink' : 'must-see';
                        onDropCalendarItem(data.itemId, targetId);
                      }
                    }
                  } catch (err) {
                    console.error('Drag back failed:', err);
                  }
                }}
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center justify-between pointer-events-auto sticky top-0 bg-bg-panel-muted z-[2] py-1.5 border-b border-border-subtle">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    {col.title}
                  </span>
                  <span className="text-[10px] font-bold text-secondary bg-surface-container px-1.5 py-0.5 rounded border border-border-subtle">
                    {col.items.length} 
                  </span>
                </h4>

                <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1.5 mt-0.5">
                   {col.items.map((item) => {
                    const isSelected = selectedItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'pocket-item',
                            item: item,
                          }));
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          onSelectItem?.(isSelected ? undefined : item.id);
                        }}
                        className={`p-2 rounded-xl flex flex-col items-stretch group transition-all duration-150 shadow-sm border ${
                          isSelected
                            ? 'bg-primary/5 border-primary/80 ring-1 ring-primary/20 shadow-md cursor-pointer'
                            : 'bg-white border-border-subtle hover:border-primary/50 cursor-grab active:cursor-grabbing'
                        }`}
                        id={`pocket-card-${item.id}`}
                      >
                        <div className="flex items-center justify-between w-full gap-1">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-[#E4E2DE] shadow-sm bg-[#F7F6F2]">
                              <img
                                src={item.imageUrl || `https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=150&auto=format&fit=crop`}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-on-surface leading-tight truncate">
                                  {hasFocus && isRelevant(item) && (
                                    <span className="inline-flex items-center align-middle mr-1 px-1 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold uppercase tracking-wide" title={`Relevant to ${focusedDayLabel || 'this day'}`}>
                                      <MapPin className="w-2 h-2 mr-0.5" />Near
                                    </span>
                                  )}
                                  {statusTags(item).includes('booked') && (
                                    <span className="inline-flex items-center align-middle mr-1 px-1 py-0.5 rounded bg-success/10 text-success text-[8px] font-bold uppercase tracking-wide" title="Reservation made">Booked</span>
                                  )}
                                  {statusTags(item).includes('backup') && (
                                    <span className="inline-flex items-center align-middle mr-1 px-1 py-0.5 rounded bg-[#EDEBE7] text-secondary text-[8px] font-bold uppercase tracking-wide" title="Optional / fallback">Backup</span>
                                  )}
                                  {item.title}
                                </p>
                                <div className="text-[10px] text-[#6A7470] font-medium mt-0.5 flex items-center gap-1.5 leading-tight">
                                  {item.rating && (
                                    <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                                      <Star className="w-2.5 h-2.5 fill-amber-500" /> {item.rating}
                                    </span>
                                  )}
                                  {item.openingHours ? (
                                    <span className="flex items-center gap-1 text-on-surface-variant">
                                      {item.openingHours}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{item.area}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[#6A7470] font-medium mt-0.5 flex items-center gap-1.5 leading-tight">
                                  {item.subCategory && <span className="flex items-center gap-1"><Tag className="w-2.5 h-2.5" />{item.subCategory}</span>}
                                  {item.subCategory && item.budget && <span className="opacity-40">•</span>}
                                  {item.budget && <span className="text-primary font-bold">{item.budget}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemovePocketItem?.(item.id);
                              }}
                              className="p-0.5 rounded-md hover:bg-black/5 opacity-40 hover:opacity-100 text-[#6A7470] hover:text-red-500 transition-all cursor-pointer shrink-0"
                              title="Remove from Bucket List"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onPromoteItem(item)}
                              title="Schedule this stop"
                              className="p-0.5 hover:bg-accent-soft rounded-lg text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 animate-fadeIn">
                             <GooglePlaceDetailsCard
                               title={item.title}
                               category={item.category}
                               rating={item.rating}
                               userRatingCount={item.userRatingCount}
                               phoneNumber={item.phoneNumber}
                               website={item.website}
                               formattedAddress={item.formattedAddress}
                               openingHours={item.openingHours}
                               editorialSummary={item.editorialSummary}
                             />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {col.items.length === 0 && (
                    <div className="py-6 text-center border border-dashed border-[#E4E2DE] rounded-[8px] bg-[#F7F6F2]/50">
                      <p className="text-[11px] text-[#6A7470] font-medium">No items in this category</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

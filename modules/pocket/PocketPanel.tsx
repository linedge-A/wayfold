/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { Plus, Compass, Coffee, ListChecks, PlusCircle, Filter, Search, X, MapPin, Star, Clock, Tag } from 'lucide-react';
import { PocketColumn, PlaceItem } from '@/shared/types/index';
import GooglePlaceDetailsCard from '@/shared/utils/GooglePlaceDetailsCard';


interface PocketPanelProps {
  pocket: PocketColumn[];
  onAddPocketItem: (columnId: string, item: PlaceItem) => void;
  onPromoteItem: (item: PlaceItem) => void;
  onClearAll: () => void;
  onRemovePocketItem?: (itemId: string) => void;
  selectedItemId?: string;
  onSelectItem?: (id: string | undefined) => void;
  onDropCalendarItem?: (itemId: string, targetColumnId: string) => void;
  /** Area of the day currently focused in the planner — used to surface relevant saved POIs. */
  focusedDayArea?: string;
  /** Label of the focused day (e.g. "Wed 14") for the relevance chip. */
  focusedDayLabel?: string;
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
  focusedDayArea,
  focusedDayLabel
}: PocketPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'must-see' | 'food-drink'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'rating'>('name');
  const [groupBy, setGroupBy] = useState<'category' | 'area'>('category');
  const [onlyRelevant, setOnlyRelevant] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Relevance: an item is relevant to the focused day when its group/area shares a
  // word with the day's area. Cheap token overlap — no contract or proximity math needed.
  const tokenize = (s?: string) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
  const focusTokens = tokenize(focusedDayArea);
  const hasFocus = focusTokens.length > 0;
  const isRelevant = (item: PlaceItem) => {
    if (!hasFocus) return false;
    const hay = tokenize(`${item.group || ''} ${item.area || ''}`);
    return focusTokens.some(t => hay.includes(t));
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

  const allItems = useMemo(() => {
    const list = pocket.flatMap(col => col.items);
    
    // Apply category filter
    let filtered = activeCategory === 'all' 
      ? list 
      : list.filter(item => {
          if (activeCategory === 'food-drink') return item.category === 'food';
          if (activeCategory === 'must-see') return item.category === 'sight';
          return true;
        });

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.area.toLowerCase().includes(q) ||
        (item.subCategory && item.subCategory.toLowerCase().includes(q))
      );
    }

    // Narrow to spots relevant to the focused day, when that lens is on
    if (onlyRelevant && hasFocus) {
      filtered = filtered.filter(isRelevant);
    }

    // Apply sorting — relevant-to-the-focused-day spots float to the top
    return [...filtered].sort((a, b) => {
      if (hasFocus && !onlyRelevant) {
        const ra = isRelevant(a) ? 0 : 1;
        const rb = isRelevant(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      if (sortBy === 'name') return a.title.localeCompare(b.title);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      return 0;
    });
  }, [pocket, activeCategory, searchQuery, sortBy, onlyRelevant, hasFocus, focusedDayArea]);

  const displayColumns = useMemo(() => {
    // Group by area / day cluster: build columns dynamically from item.group (falling back to area)
    if (groupBy === 'area') {
      const groups = new Map<string, PlaceItem[]>();
      for (const item of allItems) {
        const key = (item.group || item.area || 'Unsorted').trim() || 'Unsorted';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }
      const cols = [...groups.entries()].map(([id, items]) => ({ id: `area:${id}`, title: id, items }));
      // Relevant cluster(s) first, then larger clusters, Unsorted last
      return cols.sort((a, b) => {
        const ar = hasFocus && a.items.some(isRelevant) ? 0 : 1;
        const br = hasFocus && b.items.some(isRelevant) ? 0 : 1;
        if (ar !== br) return ar - br;
        if (a.title === 'Unsorted') return 1;
        if (b.title === 'Unsorted') return -1;
        return b.items.length - a.items.length;
      });
    }
    if (activeCategory === 'all') {
      return pocket.map(col => ({
        ...col,
        items: allItems.filter(item => {
          if (col.id === 'food-drink') return item.category === 'food';
          if (col.id === 'must-see') return item.category === 'sight';
          return false;
        })
      }));
    }
    return [{
      id: activeCategory,
      title: activeCategory === 'food-drink' ? 'Food & Drink' : 'Must See',
      items: allItems
    }];
  }, [pocket, allItems, activeCategory, groupBy, hasFocus, focusedDayArea]);

  return (
    <section className="flex-1 bg-white border border-border-subtle rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[160px]">
      {/* Bucket List Main Header */}
      <div className="px-3 py-2 border-b border-border-subtle flex justify-between items-center bg-white gap-2 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-on-surface">Bucket List</h2>
        </div>
        
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search list"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 focus:border-primary/60 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary transition-all font-medium text-on-surface placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-on-surface p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          
          {hasFocus && (
            <button
              onClick={() => setOnlyRelevant(v => !v)}
              title={`Show only saved spots relevant to ${focusedDayLabel || 'this day'}`}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer ${onlyRelevant ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-secondary border-slate-200 hover:bg-slate-50'}`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{focusedDayLabel || 'This day'}</span>
            </button>
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${showFilters ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-secondary border-slate-200 hover:bg-slate-50'}`}
            title="Filter and Sort"
          >
            <Filter className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowAddView(!showAddView)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${showAddView ? 'bg-primary text-white border-primary shadow-sm' : 'bg-primary text-white border-primary hover:bg-accent-primary-hover shadow-sm'}`}
            title="Add New Place"
          >
            <Plus className={`w-4 h-4 transition-transform ${showAddView ? 'rotate-45' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Sort Sub-header */}
      {showFilters && (
        <div className="px-3 py-2 bg-slate-50 border-b border-border-subtle flex flex-wrap items-center gap-4 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category:</span>
            <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
              {(['all', 'must-see', 'food-drink'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all capitalize cursor-pointer ${activeCategory === cat ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-slate-50'}`}
                >
                  {cat.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Group by:</span>
            <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
              {(['category', 'area'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${groupBy === g ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-slate-50'}`}
                >
                  {g === 'area' ? 'Area / Day' : 'Category'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sort by:</span>
            <div className="flex bg-white p-0.5 rounded-lg border border-slate-200">
              {(['name', 'category', 'rating'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all capitalize cursor-pointer ${sortBy === s ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:bg-slate-50'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
                      className="flex items-center gap-2 p-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-lg cursor-pointer transition-all group"
                      onClick={() => handleAddFoundPlace(place)}
                    >
                      <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-100 shrink-0">
                        <img src={place.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-on-surface truncate leading-tight">{place.title}</p>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{place.area}</p>
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
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Place Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Kinkaku-ji"
                    value={manualForm.title}
                    onChange={(e) => setManualForm({...manualForm, title: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Category</label>
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
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Area</label>
                  <input
                    type="text"
                    placeholder="e.g., Kyoto"
                    value={manualForm.area}
                    onChange={(e) => setManualForm({...manualForm, area: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Tags / Sub</label>
                  <input
                    type="text"
                    placeholder="e.g., Temple"
                    value={manualForm.subCategory}
                    onChange={(e) => setManualForm({...manualForm, subCategory: e.target.value})}
                    className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Opening Hours</label>
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
      <div className="flex-1 bg-bg-panel-muted p-3 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 min-h-full justify-stretch items-stretch">
          {displayColumns.map((col) => {
            const isFood = col.id === 'food-drink' || col.items.some(i => i.category === 'food');
            const IconComponent = isFood ? Coffee : Compass;

            return (
              <div 
                key={col.id} 
                className="flex-1 min-w-[240px] flex flex-col gap-2 p-2 rounded-2xl border border-transparent transition-all duration-150"
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
                        const targetId = col.id.startsWith('area:')
                          ? (data.item?.category === 'food' ? 'food-drink' : 'must-see')
                          : col.id;
                        onDropCalendarItem(data.itemId, targetId);
                      }
                    }
                  } catch (err) {
                    console.error('Drag back failed:', err);
                  }
                }}
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center justify-between pointer-events-auto">
                  <span className="flex items-center gap-1.5 font-bold">
                    <IconComponent className={`w-3.5 h-3.5 ${isFood ? 'text-cat-food' : 'text-primary'}`} />
                    {col.title}
                  </span>
                  <span className="text-[10px] font-bold text-secondary bg-surface-container px-1.5 py-0.5 rounded border border-border-subtle">
                    {col.items.length} 
                  </span>
                </h4>

                <div className="flex flex-col gap-2 mt-1">
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
                        className={`p-3 rounded-xl flex flex-col items-stretch group transition-all duration-150 shadow-sm border ${
                          isSelected
                            ? 'bg-primary/5 border-primary/80 ring-1 ring-primary/20 shadow-md cursor-pointer'
                            : 'bg-white border-border-subtle hover:border-primary/50 cursor-grab active:cursor-grabbing'
                        }`}
                        id={`pocket-card-${item.id}`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-100 shadow-sm bg-slate-50">
                              <img 
                                src={item.imageUrl || `https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=150&auto=format&fit=crop`} 
                                alt={item.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col h-14">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-on-surface leading-tight truncate">
                                  {hasFocus && isRelevant(item) && (
                                    <span className="inline-flex items-center align-middle mr-1 px-1 py-0.5 rounded bg-primary/10 text-primary text-[8px] font-bold uppercase tracking-wide" title={`Relevant to ${focusedDayLabel || 'this day'}`}>
                                      <MapPin className="w-2 h-2 mr-0.5" />Near
                                    </span>
                                  )}
                                  {item.title}
                                </p>
                                <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5 leading-tight">
                                  {item.openingHours ? (
                                    <span className="flex items-center gap-1 text-on-surface-variant">
                                      {item.openingHours}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{item.area}</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-medium mt-1 flex items-center gap-1.5 leading-tight">
                                  {item.subCategory && <span className="flex items-center gap-1"><Tag className="w-2.5 h-2.5" />{item.subCategory}</span>}
                                  {item.subCategory && item.budget && <span className="opacity-40">•</span>}
                                  {item.budget && <span className="text-primary font-bold">{item.budget}</span>}
                                  {item.rating && (
                                    <span className="flex items-center gap-0.5 ml-auto text-amber-500 font-bold">
                                      <Star className="w-2.5 h-2.5 fill-amber-500" /> {item.rating}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-2 shrink-0 ml-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemovePocketItem?.(item.id);
                              }}
                              className="p-1 rounded-md hover:bg-black/5 opacity-40 hover:opacity-100 text-slate-500 hover:text-red-500 transition-all cursor-pointer shrink-0"
                              title="Remove from Bucket List"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onPromoteItem(item)}
                              title="Schedule this stop"
                              className="p-1 hover:bg-accent-soft rounded-lg text-secondary hover:text-primary transition-colors cursor-pointer shrink-0"
                            >
                              <PlusCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 animate-fadeIn">
                             <GooglePlaceDetailsCard title={item.title} category={item.category} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {col.items.length === 0 && (
                    <div className="py-6 text-center border border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                      <p className="text-[11px] text-slate-400 font-medium">No items in this category</p>
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

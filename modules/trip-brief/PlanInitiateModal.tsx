/**
 * Copyright 2024 Google LLC
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { X, MapPin, Calendar, Users, MessageSquare, Plus, Sparkles, Gauge, Loader2, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateFromForm, type GenerateResult, type TripBrief } from './generateFromBrief';
import { placeItemToEngine } from './placeItemsToPool';
import type { EngineItem } from '../constraint-engine/planner.ts';

type Generated = GenerateResult & { brief: TripBrief };

interface PlanInitiateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartPlanning: (data: any) => void;
  pool?: EngineItem[]; // candidate places; falls back to the built-in sample when omitted
}

const STYLES: { id: TripBrief['style']; label: string; hint: string }[] = [
  { id: 'relaxing', label: 'Relaxing', hint: 'Slow & spacious' },
  { id: 'balanced', label: 'Balanced', hint: 'A bit of everything' },
  { id: 'intense', label: 'Intense', hint: 'See it all' },
  { id: 'luxury', label: 'Luxury', hint: 'Considered & calm' },
  { id: 'budget', label: 'Budget', hint: 'Lean & full' },
];

export default function PlanInitiateModal({ isOpen, onClose, onStartPlanning, pool }: PlanInitiateModalProps) {
  const [destinations, setDestinations] = useState<string[]>(['']);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [groupSize, setGroupSize] = useState({ adults: 2, children: 0 });
  const [style, setStyle] = useState<TripBrief['style']>('balanced');
  const [notes, setNotes] = useState('');
  const [phase, setPhase] = useState<'form' | 'generating' | 'done'>('form');
  const [result, setResult] = useState<Generated | null>(null);

  const handleAddDestination = () => setDestinations([...destinations, '']);
  const handleDestinationChange = (index: number, value: string) => {
    const newDests = [...destinations];
    newDests[index] = value;
    setDestinations(newDests);
  };
  const handleRemoveDestination = (index: number) => {
    if (destinations.length > 1) setDestinations(destinations.filter((_, i) => i !== index));
  };

  const handleGenerate = () => {
    setPhase('generating');
    (async () => {
      let effectivePool: EngineItem[] = pool && pool.length ? pool : [];
      // No saved research → ask the AI to discover real places for this destination, then plan from
      // them (the existing Google enrichment geocodes them once scheduled). No Kyoto demo injection;
      // if discovery yields nothing the trip is honestly empty for the user to fill.
      if (!effectivePool.length) {
        const destination = destinations.map(d => d.trim()).filter(Boolean).join(' → ');
        if (destination) {
          try {
            const res = await fetch('/api/discover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ destination, style, count: 10 }),
            });
            if (res.ok) {
              const j = await res.json();
              effectivePool = (j.candidates ?? []).map(placeItemToEngine);
            }
          } catch { /* offline / no AI → fall through to an empty plan */ }
        }
      }
      const r = generateFromForm({ destinations, dateRange, groupSize, style, notes }, effectivePool);
      setResult(r);
      setPhase('done');
    })();
  };

  const handleReset = () => { setPhase('form'); setResult(null); };
  const handleClose = () => { handleReset(); onClose(); };

  if (!isOpen) return null;

  const totalStops = result?.itineraryDays.reduce((n, d) => n + d.items.length, 0) ?? 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-[8px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-border-subtle flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface tracking-tight leading-tight">Start Your Journey</h2>
                <p className="text-[11px] text-[#6A7470] font-medium uppercase tracking-widest mt-0.5">Let's craft your perfect itinerary</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-[#F7F6F2] rounded-[10px] transition-colors text-secondary cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ── FORM ── */}
          {phase === 'form' && (
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
              {/* Destinations */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#6A7470] uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5" /> Destinations
                </label>
                <div className="space-y-2">
                  {destinations.map((dest, index) => (
                    <div key={index} className="flex gap-2 animate-fadeIn">
                      <input
                        type="text"
                        placeholder={index === 0 ? "Where are you heading?" : "Next stop..."}
                        value={dest}
                        onChange={(e) => handleDestinationChange(index, e.target.value)}
                        className="flex-1 px-4 py-2 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#6A7470]"
                      />
                      {destinations.length > 1 && (
                        <button onClick={() => handleRemoveDestination(index)} className="p-2 text-[#D9DDD8] hover:text-red-500 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={handleAddDestination}
                    className="w-full py-2 border border-dashed border-slate-300 rounded-[8px] text-xs font-bold text-[#6A7470] hover:text-primary hover:border-primary/50 hover:bg-primary-soft transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add another city
                  </button>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#6A7470] uppercase tracking-wider">
                  <Calendar className="w-3.5 h-3.5" /> Travel Dates
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-[#6A7470] mb-1 ml-1">Start</p>
                    <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full px-4 py-2 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[#6A7470] mb-1 ml-1">End</p>
                    <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full px-4 py-2 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
                  </div>
                </div>
                <p className="text-[10px] text-[#6A7470] font-medium italic px-1">Leave dates blank for a flexible-length plan.</p>
              </div>

              {/* Pace & Style */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#6A7470] uppercase tracking-wider">
                  <Gauge className="w-3.5 h-3.5" /> Pace &amp; Style
                </label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      title={s.hint}
                      className={`px-3.5 py-2 rounded-[10px] text-xs font-bold transition-all cursor-pointer border ${
                        style === s.id
                          ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                          : 'bg-[#F7F6F2] text-[#6A7470] border-[#E4E2DE] hover:border-primary/40 hover:text-primary'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#6A7470] font-medium italic px-1">
                  {STYLES.find(s => s.id === style)?.hint} — sets how many stops fit each day.
                </p>
              </div>

              {/* Group Size */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#6A7470] uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5" /> Travelers
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {([['Adults', 'Ages 13+', 'adults', 1], ['Children', 'Ages 2-12', 'children', 0]] as const).map(([label, sub, key, min]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px]">
                      <div>
                        <p className="text-xs font-bold text-on-surface">{label}</p>
                        <p className="text-[10px] text-[#6A7470] font-medium">{sub}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setGroupSize({ ...groupSize, [key]: Math.max(min, groupSize[key] - 1) })}
                          className="w-7 h-7 rounded-[8px] border border-[#E4E2DE] flex items-center justify-center hover:bg-white transition-colors cursor-pointer">-</button>
                        <span className="text-sm font-bold w-4 text-center">{groupSize[key]}</span>
                        <button onClick={() => setGroupSize({ ...groupSize, [key]: groupSize[key] + 1 })}
                          className="w-7 h-7 rounded-[8px] border border-[#E4E2DE] flex items-center justify-center hover:bg-white transition-colors cursor-pointer">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#6A7470] uppercase tracking-wider">
                  <MessageSquare className="w-3.5 h-3.5" /> Dreams &amp; Details
                </label>
                <textarea
                  placeholder="What are you most excited for? Any specific interests, diet requirements, or must-haves for this trip?"
                  value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  className="w-full px-4 py-3 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-[#6A7470] resize-none"
                />
                <p className="text-[10px] text-[#6A7470] font-medium italic mt-1 px-1">Hint: Mention interests like "Local ramen hunting" or "Zen temples".</p>
              </div>
            </div>
          )}

          {/* ── GENERATING ── */}
          {phase === 'generating' && (
            <div className="p-10 flex flex-col items-center justify-center gap-4 text-center min-h-[280px]">
              <div className="w-14 h-14 rounded-[8px] bg-primary-soft flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              </div>
              <div>
                <p className="text-base font-bold text-on-surface">Crafting your itinerary…</p>
                <p className="text-xs text-[#6A7470] font-medium mt-1">Clustering by area and routing to avoid backtracking</p>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && result && (
            <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-5">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-[8px] bg-emerald-50 flex items-center justify-center">
                  <Check className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="text-base font-bold text-on-surface">Your itinerary is ready</h3>
                <p className="text-xs text-[#6A7470] font-medium">
                  {result.itineraryDays.length} days · {totalStops} stops · {result.brief.destination}
                </p>
              </div>

              {result.flags.length > 0 && (
                <div className="text-[11px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  {result.flags.length} thing{result.flags.length > 1 ? 's' : ''} to review (e.g. a tight or conflicting booking).
                </div>
              )}

              <div className="space-y-2">
                {result.itineraryDays.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-3 bg-[#F7F6F2] border border-[#E4E2DE] rounded-[8px]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-primary shrink-0">{d.label}</span>
                      <span className="text-sm font-bold text-on-surface truncate">{d.areaSummary ?? 'Mixed'}</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#6A7470] shrink-0">{d.items.length} stops</span>
                  </div>
                ))}
              </div>

              {result.pocket.length > 0 && (
                <p className="text-[11px] text-[#6A7470] font-medium italic px-1">
                  {result.pocket.length} extra idea{result.pocket.length > 1 ? 's' : ''} saved to your Pocket.
                </p>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="p-6 border-t border-border-subtle bg-[#F7F6F2] shrink-0">
            {phase === 'form' && (
              <button
                onClick={handleGenerate}
                disabled={!destinations[0]?.trim()}
                className="w-full py-4 bg-primary text-white rounded-[10px] font-bold text-sm shadow-md shadow-primary/30 hover:bg-accent-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2 group"
              >
                Generate Itinerary
                <Sparkles className="w-4 h-4 group-hover:scale-125 transition-transform" />
              </button>
            )}
            {phase === 'generating' && (
              <button disabled className="w-full py-4 bg-primary/70 text-white rounded-[10px] font-bold text-sm cursor-wait flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating…
              </button>
            )}
            {phase === 'done' && result && (
              <div className="flex gap-3">
                <button onClick={handleReset} className="px-5 py-4 rounded-[10px] font-bold text-sm text-[#6A7470] bg-white border border-[#E4E2DE] hover:bg-[#F7F6F2] transition-all cursor-pointer">
                  Tweak
                </button>
                <button
                  onClick={() => { onStartPlanning(result); handleReset(); }}
                  className="flex-1 py-4 bg-primary text-white rounded-[10px] font-bold text-sm shadow-md shadow-primary/30 hover:bg-accent-primary-hover active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 group"
                >
                  View Itinerary
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

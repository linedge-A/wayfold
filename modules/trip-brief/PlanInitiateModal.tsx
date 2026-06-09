/**
 * Copyright 2024 Google LLC
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { X, MapPin, Calendar, Users, MessageSquare, Plus, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PlanInitiateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartPlanning: (data: any) => void;
}

export default function PlanInitiateModal({ isOpen, onClose, onStartPlanning }: PlanInitiateModalProps) {
  const [destinations, setDestinations] = useState<string[]>(['']);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [groupSize, setGroupSize] = useState({ adults: 2, children: 0 });
  const [notes, setNotes] = useState('');

  const handleAddDestination = () => {
    setDestinations([...destinations, '']);
  };

  const handleDestinationChange = (index: number, value: string) => {
    const newDests = [...destinations];
    newDests[index] = value;
    setDestinations(newDests);
  };

  const handleRemoveDestination = (index: number) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter((_, i) => i !== index));
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-border-subtle flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-on-surface tracking-tight leading-tight">Start Your Journey</h2>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">Let's craft your perfect itinerary</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-50 rounded-full transition-colors text-secondary cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            {/* Destinations */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
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
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400"
                    />
                    {destinations.length > 1 && (
                      <button
                        onClick={() => handleRemoveDestination(index)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleAddDestination}
                  className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-400 hover:text-primary hover:border-primary/50 hover:bg-primary-soft transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another city
                </button>
              </div>
            </div>

            {/* Dates */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Calendar className="w-3.5 h-3.5" /> Travel Dates
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                   <p className="text-[10px] font-bold text-slate-400 mb-1 ml-1">Start</p>
                   <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>
                <div>
                   <p className="text-[10px] font-bold text-slate-400 mb-1 ml-1">End</p>
                   <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Group Size */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5" /> Travelers
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div>
                    <p className="text-xs font-bold text-on-surface">Adults</p>
                    <p className="text-[10px] text-slate-400 font-medium">Ages 13+</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setGroupSize({ ...groupSize, adults: Math.max(1, groupSize.adults - 1) })}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-sm font-bold w-4 text-center">{groupSize.adults}</span>
                    <button 
                      onClick={() => setGroupSize({ ...groupSize, adults: groupSize.adults + 1 })}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div>
                    <p className="text-xs font-bold text-on-surface">Children</p>
                    <p className="text-[10px] text-slate-400 font-medium">Ages 2-12</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setGroupSize({ ...groupSize, children: Math.max(0, groupSize.children - 1) })}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-sm font-bold w-4 text-center">{groupSize.children}</span>
                    <button 
                      onClick={() => setGroupSize({ ...groupSize, children: groupSize.children + 1 })}
                      className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-white transition-colors cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5" /> Dreams & Details
              </label>
              <textarea
                placeholder="What are you most excited for? Any specific interests, diet requirements, or must-haves for this trip?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 resize-none"
              />
              <p className="text-[10px] text-slate-400 font-medium italic mt-1 px-1">
                Hint: Mention interests like "Local ramen hunting" or "Zen temples".
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border-subtle bg-slate-50 shrink-0">
            <button
              onClick={() => onStartPlanning({ destinations, dateRange, groupSize, notes })}
              disabled={!destinations[0]}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-xl shadow-primary/30 hover:bg-accent-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2 group"
            >
              Initialize Planning
              <Sparkles className="w-4 h-4 group-hover:scale-125 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

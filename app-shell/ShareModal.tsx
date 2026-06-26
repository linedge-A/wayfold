/**
 * Copyright 2024 Google LLC
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { X, Download, Copy, Instagram, Smartphone, Square as SquareIcon, Type, Image as ImageIcon, Map as MapIcon, ChevronRight, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripData: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    stops: number;
    imageUrl: string;
  };
}

type CardStyle = 'classic' | 'minimal' | 'polaroid' | 'journal';
type AspectRatio = 'story' | 'square';

export default function ShareModal({ isOpen, onClose, tripData }: ShareModalProps) {
  const [cardStyle, setCardStyle] = useState<CardStyle>('classic');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('square');
  const [headline, setHeadline] = useState(tripData.title);
  const [personalNote, setPersonalNote] = useState('Amazing memories from this trip!');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Scrim */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white w-full max-w-4xl h-[85vh] max-h-[700px] rounded-[8px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[#E4E2DE]"
        >
          {/* Left: Controls */}
          <div className="w-full md:w-1/2 p-8 overflow-y-auto custom-scrollbar border-r border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-on-surface">Share Trip</h2>
                <p className="text-sm text-[#6A7470] font-medium mt-1">Export your journey highlights</p>
              </div>
              <button 
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-[10px] hover:bg-[#EDEBE7] text-[#6A7470] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Style Selector */}
            <div className="mb-10">
              <label className="text-[11px] font-bold text-[#6A7470] uppercase tracking-widest block mb-4">Card Style</label>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {(['classic', 'minimal', 'polaroid', 'journal'] as CardStyle[]).map(style => (
                  <button
                    key={style}
                    onClick={() => setCardStyle(style)}
                    className={`px-6 py-2.5 rounded-[8px] text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                      cardStyle === style
                        ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                        : 'bg-white text-[#6A7470] border-[#E4E2DE] hover:border-primary/30'
                    }`}
                  >
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
            <div className="mb-10">
              <label className="text-[11px] font-bold text-[#6A7470] uppercase tracking-widest block mb-4">Aspect Ratio</label>
              <div className="flex p-1 bg-[#F7F6F2] rounded-[8px] border border-slate-100">
                <button 
                  onClick={() => setAspectRatio('square')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[8px] transition-all font-bold text-xs cursor-pointer ${
                    aspectRatio === 'square' ? 'bg-white shadow-md text-primary' : 'text-[#6A7470]'
                  }`}
                >
                  <SquareIcon className="w-4 h-4" />
                  Square (1:1)
                </button>
                <button 
                  onClick={() => setAspectRatio('story')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[8px] transition-all font-bold text-xs cursor-pointer ${
                    aspectRatio === 'story' ? 'bg-white shadow-md text-primary' : 'text-[#6A7470]'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  Story (9:16)
                </button>
              </div>
            </div>

            {/* Customization */}
            <div className="space-y-6">
              <div>
                <label className="text-[11px] font-bold text-[#6A7470] uppercase tracking-widest block mb-2">Headline</label>
                <div className="relative">
                  <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D9DDD8]" />
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#F7F6F2] border border-slate-100 rounded-[8px] text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#6A7470] uppercase tracking-widest block mb-2">Personal Note</label>
                <textarea
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  className="w-full px-4 py-3 bg-[#F7F6F2] border border-slate-100 rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none h-24"
                  placeholder="Share a thought..."
                />
              </div>

              <button className="w-full flex items-center justify-between px-5 py-3.5 rounded-[8px] border border-slate-100 bg-white hover:bg-[#F7F6F2] transition-colors group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[8px] bg-[#EDEBE7] overflow-hidden border border-[#E4E2DE]">
                    <img src={tripData.imageUrl} alt="Cover" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm font-bold text-on-surface">Change Photo</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#D9DDD8] group-hover:text-primary transition-colors" />
              </button>
            </div>

            {/* Actions */}
            <div className="mt-10 grid grid-cols-1 gap-3">
              <button className="w-full h-12 bg-primary text-white rounded-[10px] font-bold hover:bg-accent-primary-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer">
                <Download className="w-4 h-4" />
                Download Card
              </button>
              <button 
                onClick={handleCopy}
                className="w-full h-12 bg-white border border-[#E4E2DE] text-on-surface font-bold rounded-[10px] flex items-center justify-center gap-2 hover:bg-[#F7F6F2] active:scale-[0.98] transition-all cursor-pointer"
              >
                {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {isCopied ? 'Link Copied!' : 'Copy Share Link'}
              </button>
            </div>
          </div>

          {/* Right: Preview */}
          <div className="hidden md:flex flex-1 bg-[#F7F6F2] items-center justify-center p-12 overflow-hidden">
            <div 
              className={`relative transition-all duration-500 bg-white rounded-[2.5rem] shadow-2xl border-[8px] border-slate-900 overflow-hidden flex flex-col ${
                aspectRatio === 'square' ? 'w-[320px] aspect-square rounded-[2rem]' : 'w-[280px] h-[500px]'
              }`}
            >
              <div className="flex-grow flex flex-col p-6 relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="bg-primary/10 text-primary px-2.5 py-1 rounded-full inline-block text-[9px] font-black tracking-widest uppercase mb-2">Trip Highlights</div>
                    <h3 className="text-xl font-black text-on-surface leading-tight tracking-tight">{headline}</h3>
                    <p className="text-[10px] font-bold text-[#6A7470] mt-0.5">{tripData.destination}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
                    <MapIcon className="w-5 h-5" />
                  </div>
                </div>

                <div className="flex-grow relative rounded-[8px] overflow-hidden bg-[#EDEBE7] shadow-inner">
                  <img src={tripData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <span className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg border border-white/20 whitespace-nowrap">
                      {tripData.stops} Stops
                    </span>
                    <span className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg border border-white/20 whitespace-nowrap">
                      Archive · 2026
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col gap-3">
                  <p className="text-[11px] font-medium text-[#6A7470] leading-relaxed italic pr-4">
                    "{personalNote}"
                  </p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-brand text-xs font-bold tracking-[-0.03em] text-primary lowercase">WAYFOLD</span>
                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                      <Instagram className="w-4 h-4 text-[#D9DDD8]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

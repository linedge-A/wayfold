/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Bell, Settings, ChevronDown, Plus, FileText } from 'lucide-react';
import PlanInitiateModal from '@/modules/trip-brief/PlanInitiateModal';

interface TopHeaderProps {
  onToggleViewSheet?: () => void;
  showComponentSheet?: boolean;
  currentView: 'plan' | 'trips' | 'explore';
  onViewChange: (view: 'plan' | 'trips' | 'explore') => void;
}

export default function TopHeader({ onToggleViewSheet, showComponentSheet, currentView, onViewChange }: TopHeaderProps) {
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);

  const handleStartPlanning = (data: any) => {
    console.log('Starting planning with:', data);
    setIsInitiateModalOpen(false);
    setIsPlanOpen(false);
    onViewChange('plan');
  };

  return (
    <header className="flex justify-between items-center px-3 w-full h-[48px] bg-white border-b border-border-subtle shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewChange('plan')}>
          <span className="text-xl font-bold tracking-[-0.03em] text-primary lowercase" style={{ fontFamily: "'DM Sans', var(--font-sans)" }}>WAYFOLD</span>
        </div>
        <nav className="hidden md:flex items-center gap-4 h-full">
          <button 
            onClick={() => onViewChange('explore')}
            className={`text-sm font-medium hover:bg-surface-container-low transition-all px-2.5 h-full cursor-pointer flex items-center ${currentView === 'explore' ? 'text-primary font-bold border-b-2 border-primary' : 'text-on-surface-variant'}`}
          >
            Explore
          </button>
          
          <div className="relative h-full">
            <button 
              onClick={() => setIsPlanOpen(!isPlanOpen)}
              className={`flex items-center gap-1 text-sm font-bold px-2.5 h-full cursor-pointer transition-all ${
                isPlanOpen || currentView === 'plan' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              Plan
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isPlanOpen ? 'rotate-180' : ''}`} />
            </button>

            {isPlanOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setIsPlanOpen(false)}
                />
                <div className="absolute top-[48px] left-0 w-56 bg-white border border-border-subtle rounded-b-xl shadow-lg z-20 py-2 animate-fadeIn">
                  <button 
                    onClick={() => {
                      setIsInitiateModalOpen(true);
                      setIsPlanOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-primary hover:bg-slate-50 transition-colors cursor-pointer group text-left"
                  >
                    <div className="w-6 h-6 rounded-lg bg-primary-soft flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                    Plan new trip
                  </button>
                  
                  <div className="mt-2 pt-2 border-t border-border-subtle">
                    <div className="px-3 pb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Planning Drafts</span>
                    </div>
                    <button 
                      onClick={() => {
                        onViewChange('plan');
                        setIsPlanOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-300" />
                      Kyoto Autumn 2026
                    </button>
                    <button 
                      onClick={() => {
                        onViewChange('plan');
                        setIsPlanOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-on-surface-variant hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-300" />
                      Tokyo Food Sprint
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button 
            onClick={() => onViewChange('trips')}
            className={`text-sm font-medium hover:bg-surface-container-low transition-all px-2.5 h-full cursor-pointer flex items-center ${currentView === 'trips' ? 'text-primary font-bold border-b-2 border-primary' : 'text-on-surface-variant'}`}
          >
            Trips
          </button>
          {onToggleViewSheet && (
            <button
              onClick={onToggleViewSheet}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                showComponentSheet
                  ? 'bg-accent-soft text-primary border-primary/20'
                  : 'text-secondary hover:bg-surface-container-low border-border-subtle'
              }`}
            >
              {showComponentSheet ? 'Hide UI Truth' : 'Show UI Source of Truth'}
            </button>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          <button className="p-1.5 hover:bg-surface-container-low rounded-full text-secondary hover:text-primary transition-colors relative cursor-pointer">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger border shadow-sm"></span>
          </button>
          <button className="p-1.5 hover:bg-surface-container-low rounded-full text-secondary hover:text-primary transition-colors cursor-pointer">
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center border border-indigo-500 shadow-sm cursor-pointer hover:bg-indigo-700 transition-colors select-none" title="linedge.research@gmail.com">
          LR
        </div>
      </div>
      <PlanInitiateModal 
        isOpen={isInitiateModalOpen}
        onClose={() => setIsInitiateModalOpen(false)}
        onStartPlanning={handleStartPlanning}
      />
    </header>
  );
}

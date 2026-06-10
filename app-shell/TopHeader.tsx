/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Bell, Settings, Plus } from 'lucide-react';
import PlanInitiateModal from '@/modules/trip-brief/PlanInitiateModal';
import type { EngineItem } from '@/modules/constraint-engine/planner';

interface TopHeaderProps {
  onToggleViewSheet?: () => void;
  showComponentSheet?: boolean;
  currentView: 'plan' | 'trips' | 'explore' | 'pocket';
  onViewChange: (view: 'plan' | 'trips' | 'explore' | 'pocket') => void;
  pool?: EngineItem[];                       // candidate pool for generation (from the Research Pocket)
  onGenerated?: (result: any) => void;       // generated proposal → App state
  onLoadTrip?: (tripId: string) => void;     // switch the active trip (used by the Trips page, not the header)
}

export default function TopHeader({ onToggleViewSheet, showComponentSheet, currentView, onViewChange, pool, onGenerated }: TopHeaderProps) {
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);

  const handleStartPlanning = (result: any) => {
    onGenerated?.(result);
    setIsInitiateModalOpen(false);
    onViewChange('plan');
  };

  return (
    <header className="flex justify-between items-center px-3 w-full h-[48px] bg-white border-b border-border-subtle shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => onViewChange('explore')}>
          <span className="font-brand text-2xl font-bold tracking-[-0.03em] text-primary lowercase">WAYFOLD</span>
        </div>
        <nav className="hidden md:flex items-center gap-4 h-full">
          <button
            onClick={() => onViewChange('explore')}
            className={`text-sm font-medium hover:bg-surface-container-low transition-all px-2.5 h-full cursor-pointer flex items-center ${currentView === 'explore' ? 'text-primary font-bold border-b-2 border-primary' : 'text-on-surface-variant'}`}
          >
            Explore
          </button>

          {/* Folder = the global Research Pocket board (Agent 5 / PR #28). */}
          <button
            onClick={() => onViewChange('pocket')}
            className={`text-sm font-medium hover:bg-surface-container-low transition-all px-2.5 h-full cursor-pointer flex items-center ${currentView === 'pocket' ? 'text-primary font-bold border-b-2 border-primary' : 'text-on-surface-variant'}`}
          >
            Folder
          </button>

          {/* Trips owns the active plan: a plan IS a trip being viewed, so 'plan' lights up Trips.
              Trip switching lives on the Trips page (onLoadTrip), not a header dropdown. */}
          <button
            onClick={() => onViewChange('trips')}
            className={`text-sm font-medium hover:bg-surface-container-low transition-all px-2.5 h-full cursor-pointer flex items-center ${currentView === 'trips' || currentView === 'plan' ? 'text-primary font-bold border-b-2 border-primary' : 'text-on-surface-variant'}`}
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
        <button
          onClick={() => setIsInitiateModalOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-accent-primary-hover transition-colors cursor-pointer shadow-sm"
          title="Plan a new trip"
        >
          <Plus className="w-3.5 h-3.5" />
          Plan new trip
        </button>
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
        pool={pool}
      />
    </header>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Bell, Settings, Plus, ChevronDown, FileText, Calendar, Route, Clock, RefreshCw, Sparkles, MoreHorizontal } from 'lucide-react';
import PlanInitiateModal from '@/modules/trip-brief/PlanInitiateModal';
import { TRIPS } from '@/shared/mock-data/trips';
import type { EngineItem } from '@/modules/constraint-engine/planner';

interface TopHeaderProps {
  onToggleViewSheet?: () => void;
  showComponentSheet?: boolean;
  currentView: 'plan' | 'trips' | 'explore' | 'pocket';
  onViewChange: (view: 'plan' | 'trips' | 'explore' | 'pocket') => void;
  pool?: EngineItem[];                       // candidate pool for generation (from the Research Pocket)
  onGenerated?: (result: any) => void;       // generated proposal → App state
  onLoadTrip?: (tripId: string) => void;     // switch the active trip (title switcher + Trips page)
  tripBrief?: { id?: string; title?: string; startDate?: string; endDate?: string; style?: string; transport?: string; destination?: string };
  onRegenerate?: () => void;                 // re-plan the current trip from the pocket (keepAll)
  onStartOver?: () => void;                  // reset the workspace to the seed trip (confirm in App)
  lastRevisedAt?: number;                    // epoch ms of the last revision (drives "Last revised …")
}

export default function TopHeader({ onToggleViewSheet, showComponentSheet, currentView, onViewChange, pool, onGenerated, onLoadTrip, tripBrief, onRegenerate, onStartOver, lastRevisedAt }: TopHeaderProps) {
  const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  // Re-render every 30s so the relative "Last revised …" label stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(t); }, []);

  const timeAgo = (ts?: number): string => {
    if (!ts) return 'just now';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  };
  const fmtDay = (d?: string) => { const t = d ? Date.parse(d) : NaN; return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const dateRange = tripBrief?.startDate ? `${fmtDay(tripBrief.startDate)}${tripBrief.endDate ? ' – ' + fmtDay(tripBrief.endDate) : ''}` : '';

  const handleStartPlanning = (result: any) => {
    onGenerated?.(result);
    setIsInitiateModalOpen(false);
    onViewChange('plan');
  };

  return (
    <header className="w-full bg-white border-b border-border-subtle shrink-0">
      {/* Row 1 — global app nav */}
      <div className="flex justify-between items-center px-3 w-full h-[48px]">
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
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-[10px] border transition-all ${
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
          className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-[10px] bg-primary text-white hover:bg-accent-primary-hover transition-colors cursor-pointer shadow-sm"
          title="Plan a new trip"
        >
          <Plus className="w-3.5 h-3.5" />
          Plan new trip
        </button>
        <div className="flex gap-1.5">
          <button className="p-1.5 hover:bg-surface-container-low rounded-[10px] text-secondary hover:text-primary transition-colors relative cursor-pointer">
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger border shadow-sm"></span>
          </button>
          <button className="p-1.5 hover:bg-surface-container-low rounded-[10px] text-secondary hover:text-primary transition-colors cursor-pointer">
            <Settings className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="w-7 h-7 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center border border-primary/60 shadow-sm cursor-pointer hover:bg-accent-primary-hover transition-colors select-none" title="linedge.research@gmail.com">
          LR
        </div>
      </div>
      </div>

      {/* Row 2 — trip band: the active trip's cockpit (title switcher · metadata · actions), plan view only */}
      {currentView === 'plan' && (
        <div className="flex justify-between items-center gap-3 px-3 w-full h-[40px] border-t border-border-subtle bg-surface-container-low/30">
          {/* Title switcher + metadata chips */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <button
                onClick={() => setIsSwitcherOpen(o => !o)}
                title={tripBrief?.title}
                className="flex items-center gap-1 text-sm font-bold text-on-surface hover:text-primary transition-colors cursor-pointer max-w-[220px]"
              >
                <span className="truncate">{tripBrief?.title || 'Untitled trip'}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSwitcherOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsSwitcherOpen(false)} />
                  <div className="absolute top-7 left-0 w-60 bg-white border border-border-subtle rounded-[8px] shadow-lg z-20 py-1.5 animate-fadeIn">
                    <div className="px-3 pb-1 text-[10px] font-bold text-[#6A7470] uppercase tracking-widest">Your trips</div>
                    {Object.values(TRIPS).map(t => (
                      <button
                        key={t.tripBrief.id}
                        onClick={() => { onLoadTrip?.(t.tripBrief.id); setIsSwitcherOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[#F7F6F2] transition-colors cursor-pointer ${t.tripBrief.id === tripBrief?.id ? 'text-primary font-bold' : 'text-on-surface-variant'}`}
                      >
                        <FileText className="w-3.5 h-3.5 text-[#D9DDD8] shrink-0" />
                        <span className="truncate">{t.tripBrief.title}</span>
                      </button>
                    ))}
                    <div className="mt-1 pt-1 border-t border-border-subtle">
                      <button onClick={() => { onViewChange('trips'); setIsSwitcherOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs font-medium text-primary hover:bg-[#F7F6F2] transition-colors cursor-pointer">
                        All trips →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-on-surface-variant">
              {dateRange && <span className="flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-white border border-border-subtle"><Calendar className="w-3 h-3" />{dateRange}</span>}
              {tripBrief?.style && <span className="px-2 py-0.5 rounded-[8px] bg-white border border-border-subtle capitalize">{tripBrief.style}</span>}
              {tripBrief?.transport && <span className="flex items-center gap-1 px-2 py-0.5 rounded-[8px] bg-white border border-border-subtle capitalize"><Route className="w-3 h-3" />{tripBrief.transport}</span>}
            </div>
          </div>

          {/* Actions: last-revised · Regenerate (secondary) · Generate (primary) · overflow (Start over) */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:flex items-center gap-1 text-[11px] text-tertiary"><Clock className="w-3 h-3" />Last revised {timeAgo(lastRevisedAt)}</span>
            <button onClick={() => onRegenerate?.()} title="Re-plan from your pocket, keeping pins & bookings" className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-[10px] border border-border-subtle text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" />Regenerate
            </button>
            <button onClick={() => setIsInitiateModalOpen(true)} title="Generate an itinerary from a fresh brief" className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-[10px] bg-primary text-white hover:bg-accent-primary-hover transition-colors cursor-pointer shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />Generate
            </button>
            <div className="relative">
              <button onClick={() => setIsOverflowOpen(o => !o)} title="More" className="p-1 rounded-[10px] text-secondary hover:bg-surface-container-low transition-colors cursor-pointer">
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {isOverflowOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsOverflowOpen(false)} />
                  <div className="absolute top-7 right-0 w-40 bg-white border border-border-subtle rounded-[8px] shadow-lg z-20 py-1 animate-fadeIn">
                    <button onClick={() => { setIsOverflowOpen(false); onStartOver?.(); }} className="w-full text-left px-3 py-1.5 text-xs font-medium text-danger hover:bg-red-50 transition-colors cursor-pointer">
                      Start over
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <PlanInitiateModal
        isOpen={isInitiateModalOpen}
        onClose={() => setIsInitiateModalOpen(false)}
        onStartPlanning={handleStartPlanning}
        pool={pool}
      />
    </header>
  );
}

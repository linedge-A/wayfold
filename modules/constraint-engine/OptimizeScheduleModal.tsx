/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { X, Calendar, ArrowRight, CheckCircle2, RotateCcw, AlertTriangle, Compass, Coffee, Clock } from 'lucide-react';
import { ItineraryItem, PlaceItem } from '@/shared/types/index';
import { ProposedChange, OptimizationResult } from './optimizer';

interface OptimizeScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  newItem: PlaceItem;
  dayName: string;
  optimization: OptimizationResult;
  onConfirm: (selectedChanges: ProposedChange[]) => void;
}

export default function OptimizeScheduleModal({
  newItem,
  dayName,
  optimization,
  onConfirm,
  isOpen,
  onClose
}: OptimizeScheduleModalProps) {
  const [changes, setChanges] = useState<ProposedChange[]>(optimization.proposedChanges);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isOpen) return null;

  const handleToggleChange = (changeId: string) => {
    setChanges(prev =>
      prev.map(c => {
        if (c.id === 'new-item') return c;
        if (c.id === changeId) {
          return { ...c, checked: !c.checked };
        }
        return c;
      })
    );
  };

  const onApply = () => {
    onConfirm(changes.filter(c => c.checked));
  };

  const isFood = newItem.category === 'food';
  const IconComponent = isFood ? Coffee : Compass;
  
  const insertChange = changes.find(c => c.id === 'new-item');
  const shiftCount = changes.filter(c => c.type === 'shift' && c.checked).length;
  const skipCount = changes.filter(c => c.type === 'remove' && c.checked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn" id="optimizer-modal-container">
      <div 
        className={`bg-white rounded-[8px] border border-[#E4E2DE] shadow-md w-full transition-all duration-300 overflow-hidden flex flex-col ${isExpanded ? 'max-w-md max-h-[85vh]' : 'max-w-sm max-h-[400px]'}`}
        id="optimizer-modal"
      >
        {/* Simple Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#36453F] tracking-tight">
              {isExpanded ? 'Adjust Schedule' : 'Schedule Optimized'}
            </h2>
            <p className="text-[10px] text-[#6A7470] font-medium">{dayName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#6A7470] hover:text-[#36453F] p-1.5 rounded-[10px] hover:bg-[#F7F6F2] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 custom-scrollbar">
          {!isExpanded ? (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-3 bg-[#F7F6F2]/50 p-3 rounded-[8px] border border-slate-100">
                <div className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ${isFood ? 'bg-orange-100 text-cat-food' : 'bg-blue-100 text-primary'}`}>
                  <IconComponent className="w-5 h-5 text-current" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-[#36453F] leading-tight truncate">{newItem.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-primary bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/10">
                      {insertChange?.proposedTime}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      -{Math.max(5, optimization.originalTransitTotalMin - optimization.newTransitTotalMin)}m transit
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-center px-2">
                <p className="text-[11px] text-[#6A7470] font-medium leading-relaxed">
                  The logistics engine has found the optimal slot to prevent backtracking and preserve your relaxed pacing.
                </p>
              </div>

              <button 
                onClick={() => setIsExpanded(true)}
                className="w-full py-2 text-[#6A7470] text-[10px] font-bold hover:bg-[#F7F6F2] rounded-[10px] border border-dashed border-[#E4E2DE] transition-colors cursor-pointer"
              >
                {shiftCount > 0 || skipCount > 0 ? `Review ${shiftCount + skipCount} minor adjustments` : 'View Logistics Details'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {changes.map(c => {
                  const isNew = c.id === 'new-item';
                  const isRemove = c.type === 'remove';
                  
                  return (
                    <div
                      key={c.id}
                      onClick={() => !isNew && handleToggleChange(c.id)}
                      className={`flex items-start gap-3 p-3 rounded-[8px] border transition-all cursor-pointer ${
                        isNew ? 'border-primary/30 bg-primary/[0.02]' : isRemove ? 'border-amber-200 bg-amber-50/30' : 'border-slate-150'
                      } ${c.checked ? '' : 'opacity-60 bg-[#F7F6F2]/50'}`}
                    >
                      <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={c.checked}
                          disabled={isNew}
                          onChange={() => handleToggleChange(c.id)}
                          className="w-3.5 h-3.5 text-primary rounded cursor-pointer transition-opacity"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[11px] font-bold text-[#36453F]">
                            {isNew ? 'New Entry' : isRemove ? 'Remove Entry' : 'Shift Time'}
                          </h5>
                          {c.proposedTime && (
                             <span className="text-[10px] font-bold text-[#6A7470] bg-white px-1.5 py-0.5 rounded border border-slate-100">
                               {c.proposedTime}
                             </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#6A7470] font-medium mt-1 leading-snug">
                          {isNew ? `Schedule ${c.itemTitle}` : isRemove ? `Skip ${c.itemTitle} for pacing` : `Move ${c.itemTitle}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button 
                onClick={() => setIsExpanded(false)}
                className="w-full py-2 text-[#6A7470] text-[10px] font-bold hover:bg-[#F7F6F2] rounded-[10px] transition-colors cursor-pointer"
              >
                Back to Summary
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0 bg-[#F7F6F2]/40">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-[#6A7470] text-xs font-bold rounded-[10px] border border-[#E4E2DE] hover:bg-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="flex-[2] px-4 py-2 bg-primary hover:bg-primary-variant text-white text-xs font-bold rounded-[10px] shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            Confirm & Reschedule
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Maximize2, Map, Bot } from 'lucide-react';

interface FocusModeSplashProps {
  onRestoreMap: () => void;
  onAskCopilot: () => void;
}

export default function FocusModeSplash({ onRestoreMap, onAskCopilot }: FocusModeSplashProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden select-none">
      {/* Decorative calm mesh blur background */}
      <div className="absolute w-[360px] h-[360px] rounded-full bg-primary/5 blur-[80px] -z-10 pointer-events-none"></div>

      <div className="text-center max-w-sm p-8 bg-white/80 border border-border-subtle rounded-[8px] shadow-lg relative z-10">
        <div className="mb-6 inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-primary">
          <Maximize2 className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-on-surface mb-2">Focus Mode Active</h2>
        <p className="text-xs text-on-surface-variant leading-relaxed mb-8">
          Your workspace is streamlined for distraction-free schedule refining. The map and pocket are hidden to prioritize your itinerary.
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onRestoreMap}
            className="flex items-center gap-1.5 px-4 py-2 border border-border-subtle hover:bg-surface-container-low text-xs font-semibold rounded-[10px] transition-colors cursor-pointer text-on-surface"
          >
            <Map className="w-4 h-4 text-primary" />
            Restore Map
          </button>
          <button
            onClick={onAskCopilot}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-[10px] hover:opacity-95 transition-opacity cursor-pointer shadow-sm"
          >
            <Bot className="w-4 h-4" />
            Ask Copilot
          </button>
        </div>
      </div>
    </div>
  );
}

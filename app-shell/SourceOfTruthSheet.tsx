/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldCheck, Database, KeySquare, Layers } from 'lucide-react';
import { AppState, ItineraryItem, PocketColumn, BookingRecord, RevisionDelta } from '@/shared/types/index';

interface SourceOfTruthProps {
  appState: AppState;
  hasApi: boolean;
}

export default function SourceOfTruthSheet({ appState, hasApi }: SourceOfTruthProps) {
  return (
    <div className="w-full bg-slate-900 text-slate-100 p-6 rounded-[8px] border border-slate-800 shadow-2xl relative select-text">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100">Workspace Source of Truth (AppState Store)</h3>
            <p className="text-[11px] text-slate-400">Live rendering the immutable structural state representation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
            <Layers className="w-3 h-3" />
            Client Persistent
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
            hasApi
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {hasApi ? 'Gemini Live Proxy Enabled' : 'Simulated Intelligent Agent'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Metadata Schema */}
        <div className="bg-slate-950/80 p-4 rounded-[8px] border border-slate-800 flex flex-col gap-3">
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <KeySquare className="w-3.5 h-3.5 text-blue-400" />
            Trip Brief &amp; Config
          </h4>
          <div className="space-y-2 text-[11px] font-mono leading-relaxed text-slate-300">
            <p><span className="text-indigo-400">id:</span> "{appState.tripBrief.id}"</p>
            <p><span className="text-indigo-400">title:</span> "{appState.tripBrief.title}"</p>
            <p><span className="text-indigo-400">destination:</span> "{appState.tripBrief.destination}"</p>
            <p><span className="text-indigo-400">style:</span> "{appState.tripBrief.style}"</p>
            <p><span className="text-indigo-400">transport:</span> "{appState.tripBrief.transport}"</p>
            <p><span className="text-indigo-400">flexibleDates:</span> {appState.tripBrief.flexibleDates.toString()}</p>
          </div>
        </div>

        {/* Mapped Stops Schema */}
        <div className="bg-slate-950/80 p-4 rounded-[8px] border border-slate-800 flex flex-col gap-3">
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Planned Stops ({appState.itineraryItems.length})
          </h4>
          <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {appState.itineraryItems.map((item) => (
              <div key={item.id} className="text-[10px] font-mono text-slate-400 border-b border-slate-900 pb-1.5 last:border-b-0 flex justify-between items-start gap-2">
                <div>
                  <p className="text-slate-200 font-bold truncate max-w-[140px]">{item.title}</p>
                  <p className="text-[9px] text-slate-500">{item.dayId} • {item.startTime || 'TBD'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className="px-1 bg-slate-800 rounded text-[8px] uppercase text-slate-300">
                    {item.pinState}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Bookings Schema */}
        <div className="bg-slate-950/80 p-4 rounded-[8px] border border-slate-800 flex flex-col gap-3">
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Database className="w-3.5 h-3.5 text-orange-400" />
            Bookings Ledger ({appState.bookings.length})
          </h4>
          <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {appState.bookings.map((b) => (
              <div key={b.id} className="text-[10px] font-mono text-slate-400 border-b border-slate-900 pb-1.5 last:border-b-0 flex justify-between items-center">
                <div>
                  <p className="text-slate-200 font-bold truncate max-w-[150px]">{b.title}</p>
                  <p className="text-[9px] text-slate-500">Conf: {b.confirmationCode || 'PENDING'}</p>
                </div>
                <span className={`px-1 rounded text-[8px] font-bold ${
                  b.confirmed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {b.confirmed ? 'CONFIRMED' : 'WAITLIST'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

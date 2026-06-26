/**
 * Copyright 2024 Google LLC
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Search, Plus, Filter, MapPin, Calendar, Clock, Globe, Navigation, ChevronRight, Users, Star, Compass, Share2 } from 'lucide-react';
import { TripArchiveItem, TripBrief } from '@/shared/types/index';
import { INITIAL_TRIP_ARCHIVE } from '@/shared/mock-data/seedData';
import { motion } from 'motion/react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo } from 'react';

// Mirror MapPanel/App: only mount <Map> with a real key. Without one the Maps API
// fails to load and <Map>/<AdvancedMarker> throw, taking the whole page down via the
// app-level ErrorBoundary. (TODO: extract this key check into a shared util.)
const MAPS_KEY =
  (typeof process !== 'undefined' ? process.env.GOOGLE_MAPS_PLATFORM_KEY : '') ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const MAPS_KEY_VALID = Boolean(MAPS_KEY) && MAPS_KEY !== 'YOUR_API_KEY' && MAPS_KEY.length > 10;

// ISO dates read as raw data ("2024-04-12") — format to match the header band ("Apr 12, 2024").
const fmtTripDate = (d?: string) => {
  const t = d ? Date.parse(d) : NaN;
  return Number.isNaN(t) ? (d || '') : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface TripsPageProps {
  currentTrip?: TripBrief;
  /** Stop count of the live trip, so its card doesn't read "0 stops". */
  currentTripStops?: number;
  onViewChange?: (view: 'plan' | 'trips' | 'explore') => void;
  onShare?: (trip: any) => void;
  onLoadTrip?: (tripId: string) => void;
}

export default function TripsPage({ currentTrip, currentTripStops, onViewChange, onShare, onLoadTrip }: TripsPageProps) {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past' | 'draft'>('all');

  // Open a trip: load its authored dataset if we have one (Kyoto / Iceland),
  // otherwise just switch to the planner.
  const openTrip = (tripId: string) => {
    if (onLoadTrip) onLoadTrip(tripId);
    else if (onViewChange) onViewChange('plan');
  };

  const liveDraft = useMemo(() => {
    if (!currentTrip) return null;
    return {
      id: currentTrip.id,
      title: currentTrip.title,
      destination: currentTrip.destination,
      startDate: currentTrip.startDate,
      endDate: currentTrip.endDate,
      stopCount: currentTripStops ?? 0,
      status: 'upcoming' as const,
      imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=600&auto=format&fit=crop',
      participants: ['usr-1']
    };
  }, [currentTrip, currentTripStops]);

  const allTrips = useMemo(() => {
    const archive = [...INITIAL_TRIP_ARCHIVE];
    if (liveDraft && !archive.find(t => t.id === liveDraft.id)) {
      archive.unshift(liveDraft);
    }
    return archive;
  }, [liveDraft]);

  const filteredTrips = allTrips.filter(trip =>
    filter === 'all' ||
    (filter === 'upcoming' && trip.status === 'upcoming') ||
    (filter === 'past' && (trip.status === 'completed' || trip.status === 'archived')) ||
    (filter === 'draft' && trip.status === 'draft'));

  const upcoming = filteredTrips.filter(t => t.status === 'upcoming');
  const completed = filteredTrips.filter(t => t.status === 'completed' || t.status === 'archived');
  const drafts = filteredTrips.filter(t => t.status === 'draft');

  // Map Coordinates for Global Archive (Simulated mapping for main cities)
  const cityCoords: Record<string, google.maps.LatLngLiteral> = {
    'Tokyo': { lat: 35.6762, lng: 139.6503 },
    'Kyoto': { lat: 35.0116, lng: 135.7681 },
    'Amalfi': { lat: 40.6333, lng: 14.6000 },
    'Paris': { lat: 48.8566, lng: 2.3522 },
    'Santorini': { lat: 36.3932, lng: 25.4615 },
  };

  const mapPoints = allTrips
    .map(t => cityCoords[t.destination.split(',')[0].trim()])
    .filter(Boolean);

  return (
    <div className="flex h-full w-full bg-bg-panel-muted overflow-hidden">
      {/* Left List Panel */}
      <aside className="w-[520px] bg-white border-r border-border-subtle flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-surface-container p-1 rounded-[8px] w-fit">
            {(['all', 'upcoming', 'past', 'draft'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold transition-all capitalize cursor-pointer ${
                  filter === f ? 'bg-white text-primary shadow-sm' : 'text-secondary hover:text-on-surface'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-[10px] font-bold text-sm hover:bg-accent-primary-hover active:scale-95 transition-all cursor-pointer shrink-0">
            <Plus className="w-4 h-4" />
            New Trip
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-widest mb-4">Upcoming</h2>
              <div className="space-y-4">
                {upcoming.map(trip => (
                  <TripArchiveCard 
                    key={trip.id} 
                    trip={trip} 
                    onClick={() => openTrip(trip.id)}
                    onShare={onShare}
                  />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-widest mb-4">Past Trips</h2>
              <div className="space-y-4">
                {completed.map(trip => (
                  <TripArchiveCard
                    key={trip.id}
                    trip={trip}
                    onClick={() => openTrip(trip.id)}
                    onShare={onShare}
                  />
                ))}
              </div>
            </section>
          )}

          {drafts.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-widest mb-4">Drafts</h2>
              <div className="space-y-4">
                {drafts.map(trip => (
                  <TripArchiveCard 
                    key={trip.id} 
                    trip={trip} 
                    onClick={() => openTrip(trip.id)}
                    onShare={onShare}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>

      {/* Right Map/Insights Panel */}
      <section className="flex-1 relative overflow-hidden bg-bg-panel-muted flex flex-col">
        <div className="absolute top-6 left-6 flex flex-col gap-4 z-10">
          <div className="bg-white p-4 rounded-[8px] border border-border-subtle shadow-md w-64 animate-fadeIn">
            <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Visited Insights
            </h4>
            <div className="space-y-2.5">
              <InsightRow label="Japan" value="2 Trips" color="bg-primary" />
              <InsightRow label="Italy" value="1 Trip" color="bg-primary/60" />
              <InsightRow label="France" value="1 Trip" color="bg-primary/30" />
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
               <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Navigation className="w-3.5 h-3.5 fill-primary" /> 28 Stops Total
               </div>
            </div>
          </div>
        </div>

        {/* Real Google Map for Archive */}
        <div className="flex-1 w-full bg-bg-panel-muted animate-fadeIn">
          {MAPS_KEY_VALID ? (
          <Map
            defaultCenter={{ lat: 30, lng: 130 }}
            defaultZoom={3}
            mapId="TRIPS_ARCHIVE_MAP"
            disableDefaultUI={true}
            gestureHandling={'greedy'}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          >
            <MapBoundsFitter points={mapPoints} />

            {allTrips.map((trip) => {
              const coords = cityCoords[trip.destination.split(',')[0].trim()];
              if (!coords) return null;

              const isUpcoming = trip.status === 'upcoming';
              return (
                <AdvancedMarker key={trip.id} position={coords}>
                  <div className="relative group">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-lg transition-transform group-hover:scale-110 ${isUpcoming ? 'bg-primary text-white' : 'bg-success text-white'}`}>
                      <Compass className="w-4 h-4" />
                    </div>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      <p className="text-xs font-medium text-on-surface">{trip.title}</p>
                    </div>
                  </div>
                </AdvancedMarker>
              );
            })}
          </Map>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 text-[#6A7470]">
              <Globe className="w-10 h-10 mb-3 opacity-60" />
              <p className="text-sm font-bold text-[#6A7470]">Archive map preview</p>
              <p className="text-xs mt-1 max-w-[220px]">Add a Google Maps key to view your trips on the globe.</p>
            </div>
          )}
        </div>

      </section>
    </div>
  );
}

function MapBoundsFitter({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach((pt) => bounds.extend(pt));
    
    // Check if bounds are not empty
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 80);
      // If only Japan, don't zoom in too much
      const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom()! > 5) map.setZoom(5);
      });
      return () => google.maps.event.removeListener(listener);
    }
  }, [map, points]);

  return null;
}

function TripArchiveCard(props: { trip: TripArchiveItem; key?: any; onClick?: () => void; onShare?: (trip: any) => void }) {
  const { trip, onClick, onShare } = props;
  const isUpcoming = trip.status === 'upcoming';
  const isDraft = trip.status === 'draft';
  const isCompleted = trip.status === 'completed' || trip.status === 'archived';

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={`bg-white rounded-[8px] border border-border-subtle shadow-sm overflow-hidden group cursor-pointer hover:border-primary/40 hover:shadow-md transition-all ${!isUpcoming ? 'opacity-90 grayscale-[10%]' : ''}`}
    >
      <div className="aspect-[2/1] w-full relative overflow-hidden">
        <img
          src={trip.imageUrl}
          className="w-full h-full object-cover"
          alt={trip.title}
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4">
          <div className={`px-2 py-0.5 rounded-[8px] text-xs font-medium tracking-wider uppercase border shadow-sm ${
            isUpcoming ? 'bg-primary text-white border-primary' :
            isDraft ? 'bg-warning/10 text-warning border-warning/30' :
            'bg-success/10 text-success border-success/30'
          }`}>
            {trip.status}
          </div>
        </div>
        {trip.archiveEntryNumber && (
          <div className="absolute bottom-4 left-4">
             <div className="bg-on-surface/70 px-2 py-0.5 rounded-md text-xs font-medium text-white uppercase tracking-widest">
                ENTRY #{trip.archiveEntryNumber}
             </div>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 pr-4">
            <h3 className="text-sm font-semibold text-on-surface leading-tight group-hover:text-primary transition-colors">{trip.title}</h3>
            <p className="text-xs text-secondary font-medium mt-1 flex items-center gap-1.5">
               <Calendar className="w-3 h-3" />
               {fmtTripDate(trip.startDate)}{trip.endDate ? ` – ${fmtTripDate(trip.endDate)}` : ''}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare?.({
                title: trip.title,
                destination: trip.destination,
                stops: trip.stopCount,
                imageUrl: trip.imageUrl
              });
            }}
            className="w-10 h-10 rounded-[10px] bg-[#F7F6F2] flex items-center justify-center text-[#D9DDD8] opacity-0 group-hover:opacity-100 group-hover:bg-primary-soft group-hover:text-primary hover:scale-110 active:scale-95 transition-all shadow-sm cursor-pointer"
            title="Share trip"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle">
           <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs font-medium text-secondary">
                <MapPin className="w-3 h-3" /> {trip.destination.split(',')[0]}
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-secondary">
                <Navigation className="w-3 h-3" /> {trip.stopCount} stops
              </div>
           </div>
           {trip.participants && trip.participants.length > 0 && (
              <div className="flex -space-x-1.5">
                 {trip.participants.map((p, i) => (
                   <div key={i} className="w-5 h-5 rounded-full bg-surface-container border border-white overflow-hidden shadow-sm">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${p}`} className="w-full h-full object-cover" />
                   </div>
                 ))}
              </div>
           )}
        </div>
      </div>
    </motion.div>
  );
}

function InsightRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      </div>
      <span className="text-xs font-bold text-on-surface">{value}</span>
    </div>
  );
}

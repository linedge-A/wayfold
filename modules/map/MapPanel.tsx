/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Coffee, Compass, MapPin } from 'lucide-react';
import { ItineraryItem, PlaceItem } from '@/shared/types/index';

interface MapPanelProps {
  items: ItineraryItem[];
  selectedItemId?: string;
  hoveredItemId?: string;
  onSelectItem?: (id: string | undefined) => void;
  onHoverItem?: (id: string | undefined) => void;
  pocketItems?: PlaceItem[];
}

// Safely resolve the Google Maps API Key from the Vite define setup
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// Real coordinates for seed places in Kyoto & Nara
const RealCoordsMap: Record<string, { lat: number; lng: number }> = {
  'place-kix': { lat: 34.4320, lng: 135.2304 },
  'place-ace': { lat: 35.0112, lng: 135.7593 },
  'place-kiyomizu': { lat: 34.9949, lng: 135.7850 },
  'place-nishiki-lunch': { lat: 35.0050, lng: 135.7649 },
  'place-bamboo': { lat: 35.0156, lng: 135.6715 },
  'place-shigetsu': { lat: 35.0158, lng: 135.6776 },
  'place-otagi': { lat: 35.0294, lng: 135.6622 },
  'place-fushimi': { lat: 34.9671, lng: 135.7727 },
  'place-nara': { lat: 34.6851, lng: 135.8430 },
  'place-nijo': { lat: 35.0142, lng: 135.7482 },
  'place-arashiyama-full': { lat: 35.0094, lng: 135.6668 },
  'place-nishiki-market-save': { lat: 35.0050, lng: 135.7649 },
  'place-kurasu': { lat: 34.9875, lng: 135.7570 },
  'place-pontocho': { lat: 35.0062, lng: 135.7709 },
};

function getLatLng(item: PlaceItem, index: number): google.maps.LatLngLiteral {
  if (RealCoordsMap[item.id]) {
    return RealCoordsMap[item.id];
  }
  // Check if Coordinates are valid Japan/Kyoto coordinates and not double-digit placeholder mocks
  if (item.lat !== undefined && item.lng !== undefined && item.lat > 30 && item.lat < 46 && item.lng > 125 && item.lng < 146) {
    return { lat: item.lat, lng: item.lng };
  }
  // Fallback to Kyoto Center with some offset if not in preset map
  const defaultCenter = { lat: 35.0116, lng: 135.7681 };
  return {
    lat: defaultCenter.lat + ((index % 5) - 2) * 0.008,
    lng: defaultCenter.lng + (((index * 2) % 5) - 2) * 0.008,
  };
}

// Auto-adjust center and zoom using a LatLngBounds bounding box
function MapBoundsFitter({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds);

    // If only one point is mapped, let's keep zoom level comfortable 
    if (points.length === 1) {
      const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        map.setZoom(14);
      });
      return () => google.maps.event.removeListener(listener);
    }
  }, [map, points]);

  return null;
}

// Polyline component to connect chronological waypoints
function PolylineOverlay({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length < 2) return;

    const polyline = new google.maps.Polyline({
      path: points,
      geodesic: true,
      strokeColor: '#3B82F6', // Primary Blue accent
      strokeOpacity: 0.8,
      strokeWeight: 4,
    });

    polyline.setMap(map);

    return () => {
      polyline.setMap(null);
    };
  }, [map, points]);

  return null;
}

// Gently recenter the map on the item selected elsewhere (calendar / pocket),
// so cross-pane selection stays visually connected without changing zoom.
function SelectionPanner({ target }: { target: google.maps.LatLngLiteral | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
  }, [map, target?.lat, target?.lng]);

  return null;
}

export default function MapPanel({ items, selectedItemId, hoveredItemId, onSelectItem, onHoverItem, pocketItems }: MapPanelProps) {
  // Filter active day itinerary items (filter out lodging/airport transit from primary route connections if desired, or keep classic ones)
  const mapItems = items
    .filter(item => item.category !== 'stay' && item.category !== 'transit')
    .map((item, index) => ({
      ...item,
      latLng: getLatLng(item, index),
      indexOrder: index + 1
    }));

  // Show ALL saved pocket spots as faint "candidate" markers so the Research
  // Pocket is spatially integrated with the day's route. Skip any already
  // scheduled into today's route to avoid duplicate pins.
  const routeIds = new Set(mapItems.map(i => i.id));
  const candidateItems = (pocketItems || [])
    .filter(item => !routeIds.has(item.id))
    .map((item, index) => ({
      ...item,
      latLng: getLatLng(item, index + 20)
    }));

  // Find selected item representation to display modal/dialog details InfoWindow
  const selectedItem = (
    mapItems.find(item => item.id === selectedItemId) ||
    candidateItems.find(item => item.id === selectedItemId)
  ) as any;

  // Fit bounds to the day's route so it stays framed; if today has no mapped
  // stops, frame the saved candidates instead so the pocket keeps context.
  const allPoints = mapItems.length > 0
    ? mapItems.map(i => i.latLng)
    : candidateItems.map(i => i.latLng);

  // If the user has not pasted their active key, present a beautiful layout guide
  if (!hasValidKey) {
    return (
      <section className="flex-1 bg-white border border-border-subtle rounded-2xl overflow-hidden relative shadow-sm flex flex-col min-h-[220px]">
        <div className="flex-1 bg-slate-50 relative overflow-hidden flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-dashed border-slate-300 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4 text-blue-600">
              <MapPin className="w-6 h-6 animate-bounce" />
            </div>
            <h2 className="text-[15px] font-bold text-slate-900 mb-2">Google Maps Key Needed</h2>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Connect this Kyoto travel dashboard to a live, interactive Google Maps display to view exact locations, pin drops, and relative distances!
            </p>
            
            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-700 leading-normal mb-4 flex flex-col gap-2.5">
              <div>
                <span className="font-bold text-blue-600">Step 1:</span> Get a real Maps key:
                <a 
                  href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" 
                  target="_blank" 
                  referrerPolicy="no-referrer"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-500 hover:underline inline-block ml-1"
                >
                  Get Key &rarr;
                </a>
              </div>
              <div>
                <span className="font-bold text-blue-600">Step 2:</span> Paste when the **"Enter your environment variable to continue"** popup appears.
              </div>
              <div>
                <span className="font-bold text-blue-600">Step 3:</span> Or manually: Open <strong>Settings</strong> (⚙️ gear icon, top-right) &rarr; <strong>Secrets</strong> &rarr; add <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-medium">GOOGLE_MAPS_PLATFORM_KEY</code> &rarr; save.
              </div>
            </div>
            <p className="text-[10px] text-slate-400 italic">
              *The app re-compiles automatically after adding your key. No reload required.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 bg-white border border-border-subtle rounded-2xl overflow-hidden relative shadow-sm flex flex-col min-h-[220px]">
      <div className="flex-1 bg-[#F1F5F9] relative overflow-hidden">
        <Map
          defaultCenter={{ lat: 35.0116, lng: 135.7681 }}
          defaultZoom={13}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          disableDefaultUI={true}
          zoomControl={true}
        >
          {/* Auto center and scale fitting */}
          <MapBoundsFitter points={allPoints} />

          {/* Pan to whatever is selected in the calendar / pocket */}
          <SelectionPanner target={selectedItem?.latLng ?? null} />

          {/* Chronological lines between stops removed on user request */}

          {/* Active itinerary points on the map */}
          {mapItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isHovered = hoveredItemId === item.id;
            const categoryColor = item.category === 'food' ? '#F2994A' :
                                item.category === 'sight' ? '#2F80ED' :
                                item.category === 'stay' ? '#9B51E0' :
                                item.category === 'transit' ? '#27AE60' : '#3B82F6';
            
            return (
              <AdvancedMarker
                key={item.id}
                position={item.latLng}
                onClick={() => onSelectItem?.(isSelected ? undefined : item.id)}
              >
                <div
                  className="relative"
                  style={{ width: '36px', height: '36px' }}
                  onMouseEnter={() => onHoverItem?.(item.id)}
                  onMouseLeave={() => onHoverItem?.(undefined)}
                >
                  {isSelected && (
                    <div
                      className="absolute inset-0 w-9 h-9 rounded-full animate-ping -translate-x-[2px] -translate-y-[2px]"
                      style={{ backgroundColor: `${categoryColor}33` }}
                    />
                  )}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-[3px] shadow-lg transition-all duration-150 bg-white ${
                      isSelected ? 'scale-110' : isHovered ? 'scale-110 ring-2 ring-primary/50' : 'hover:scale-105'
                    }`}
                    style={{
                      borderColor: categoryColor,
                      color: categoryColor
                    }}
                  >
                    {item.indexOrder}
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Saved pocket candidates — faint until selected, for spatial context */}
          {candidateItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isFood = item.category === 'food' || item.id.includes('food') || item.id.includes('market') || item.id.includes('kurasu');
            const Icon = isFood ? Coffee : Compass;

            return (
              <AdvancedMarker
                key={item.id}
                position={item.latLng}
                onClick={() => onSelectItem?.(isSelected ? undefined : item.id)}
                zIndex={isSelected ? 50 : 1}
                title={`Saved: ${item.title}`}
              >
                <div className="relative" style={{ width: '32px', height: '32px' }}>
                  {isSelected && (
                    <div className={`absolute inset-0 w-8 h-8 rounded-full animate-ping ${isFood ? 'bg-orange-500/20' : 'bg-blue-500/20'}`} />
                  )}
                  <div
                    className={`rounded-full flex items-center justify-center shadow-md transition-all duration-150 ${
                      isSelected
                        ? `w-8 h-8 border-2 scale-110 ${isFood ? 'bg-orange-500 text-white border-white' : 'bg-blue-600 text-white border-white'}`
                        : `w-6 h-6 border border-dashed bg-white/90 hover:scale-110 hover:bg-white ${isFood ? 'text-orange-500 border-orange-300' : 'text-slate-400 border-slate-300'}`
                    }`}
                  >
                    <Icon className={isSelected ? 'w-4 h-4' : 'w-3 h-3'} />
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Premium InfoWindow Popups for active stop or selected bucket list item */}
          {selectedItem && (
            <InfoWindow
              position={getLatLng(selectedItem, 0)}
              onCloseClick={() => onSelectItem?.(undefined)}
              headerDisabled={true}
            >
              <div className="p-1 min-w-[180px] max-w-[260px] text-slate-800">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${selectedItem.category === 'food' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                  <h3 className="font-bold text-xs tracking-tight text-slate-900">{selectedItem.title}</h3>
                </div>
                <p className="text-[10px] text-slate-500 font-medium mb-1">{selectedItem.area}</p>
                
                {selectedItem.openingHours && (
                  <p className="text-[9px] text-slate-400">Hours: {selectedItem.openingHours}</p>
                )}
                {selectedItem.startTime && (
                  <p className="text-[9px] text-slate-400 font-medium">Scheduled: {selectedItem.startTime} - {selectedItem.endTime}</p>
                )}
                {selectedItem.note && (
                  <p className="text-[9px] bg-slate-50 text-slate-600 p-1 rounded border border-slate-100 mt-1 italic leading-normal">
                    "{selectedItem.note}"
                  </p>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>

        {mapItems.length === 0 && candidateItems.length === 0 && (
          <div className="absolute inset-x-0 bottom-4 mx-auto max-w-[220px] bg-white border border-border-subtle rounded-full text-center py-1.5 px-3 shadow-md text-xs text-slate-500 font-medium pointer-events-none z-10">
            Leisure day – map centered on Kyoto
          </div>
        )}
      </div>
    </section>
  );
}

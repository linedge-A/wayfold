/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Coffee, Compass, MapPin } from 'lucide-react';
import { ItineraryItem, PlaceItem } from '@/shared/types/index';
import { zoomCluster, type ClusterPoint, type ZoomClusterResult, type LatLngBounds as ZCBounds } from './zoomCluster';

// Zoom thresholds for the level-of-detail aggregation (see ./zoomCluster):
// < CITY_ZOOM → shaded country clusters · < PIN_ZOOM → city dots (# of POI) · >= PIN_ZOOM → in-city scatter.
const CITY_ZOOM = 5;
const PIN_ZOOM = 11;

interface MapPanelProps {
  items: ItineraryItem[];
  selectedItemId?: string;
  hoveredItemId?: string;
  onSelectItem?: (id: string | undefined) => void;
  onHoverItem?: (id: string | undefined) => void;
  pocketItems?: PlaceItem[];
  /** Reports the live map zoom so a sibling list can adapt its area grouping to the same scale. */
  onZoomChange?: (zoom: number) => void;
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
  // Real, Google-enriched coordinates are valid ANYWHERE on Earth (lat ±90, lng ±180) — not
  // Japan-only. `googlePlaceFieldsLoaded` distinguishes real geocoded coords from the normalized
  // map-space placeholder seeds (which also fall in a valid numeric range), so Paris/NYC/Reykjavík
  // trips render in the right place instead of snapping back to Kyoto.
  const realGeo = item.lat != null && item.lng != null && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180;
  if (realGeo && (item as any).googlePlaceFieldsLoaded) {
    return { lat: item.lat as number, lng: item.lng as number };
  }
  // Fallback offset for items with no usable coordinates yet (un-enriched placeholders).
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

// Report the live zoom + viewport bounds on every map idle, so the panel can pick the
// level-of-detail tier. (Provider glue around the pure ./zoomCluster logic.)
function ZoomTracker({ onChange }: { onChange: (zoom: number, bounds: ZCBounds | null) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const emit = () => {
      const lb = map.getBounds();
      let bounds: ZCBounds | null = null;
      if (lb) {
        const ne = lb.getNorthEast();
        const sw = lb.getSouthWest();
        bounds = { north: ne.lat(), south: sw.lat(), east: ne.lng(), west: sw.lng() };
      }
      onChange(map.getZoom() ?? 0, bounds);
    };
    emit();
    const listener = map.addListener('idle', emit);
    return () => listener.remove();
  }, [map, onChange]);
  return null;
}

// Aggregated tiers: translucent "shaded region" circles (country/city) + a count bubble
// per cluster showing the # of POI. Clicking a region drills into the in-city scatter.
function AggregationLayer({ result }: { result: ZoomClusterResult<ClusterPoint> }) {
  const map = useMap();
  useEffect(() => {
    if (!map || result.tier === 'pins') return;
    const radiusM = result.tier === 'country' ? 220000 : 16000; // continental vs city-sized shading
    const circles = result.clusters.map(c => new google.maps.Circle({
      map, center: c.centroid, radius: radiusM,
      fillColor: '#2F80ED', fillOpacity: 0.12,
      strokeColor: '#2F80ED', strokeOpacity: 0.35, strokeWeight: 1, clickable: false,
    }));
    return () => circles.forEach(c => c.setMap(null));
  }, [map, result]);

  if (result.tier === 'pins') return null;
  return (
    <>
      {result.clusters.map(c => (
        <AdvancedMarker
          key={c.key}
          position={c.centroid}
          onClick={() => { map?.panTo(c.centroid); map?.setZoom(PIN_ZOOM); }}
        >
          <div
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-primary text-white shadow-lg border-2 border-white cursor-pointer hover:scale-105 transition-transform"
            title={`${c.count} saved in ${c.label} — click to zoom in`}
          >
            <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold">{c.count}</span>
            <span className="text-[11px] font-bold whitespace-nowrap max-w-[130px] truncate">{c.label}</span>
          </div>
        </AdvancedMarker>
      ))}
    </>
  );
}

export default function MapPanel({ items, selectedItemId, hoveredItemId, onSelectItem, onHoverItem, pocketItems, onZoomChange }: MapPanelProps) {
  // Filter active day itinerary items (filter out lodging/airport transit from primary route connections if desired, or keep classic ones)
  // Memoized so the derived arrays keep a stable identity when `items` is unchanged —
  // otherwise a fresh array every render re-fires the bounds/polyline effects below.
  const mapItems = useMemo(() => items
    .filter(item => item.category !== 'stay' && item.category !== 'transit')
    .map((item, index) => ({
      ...item,
      latLng: getLatLng(item, index),
      indexOrder: index + 1
    })), [items]);

  // Show ALL saved pocket spots as faint "candidate" markers so the Research
  // Pocket is spatially integrated with the day's route. Skip any already
  // scheduled into today's route to avoid duplicate pins.
  const candidateItems = useMemo(() => {
    const routeIds = new Set(mapItems.map(i => i.id));
    return (pocketItems || [])
      .filter(item => !routeIds.has(item.id))
      .map((item, index) => ({
        ...item,
        latLng: getLatLng(item, index + 20)
      }));
  }, [pocketItems, mapItems]);

  // Find selected item representation to display modal/dialog details InfoWindow
  const selectedItem = (
    mapItems.find(item => item.id === selectedItemId) ||
    candidateItems.find(item => item.id === selectedItemId)
  ) as any;

  // Fit bounds to the day's route so it stays framed; if today has no mapped
  // stops, frame the saved candidates instead so the pocket keeps context.
  const allPoints = useMemo(() => mapItems.length > 0
    ? mapItems.map(i => i.latLng)
    : candidateItems.map(i => i.latLng), [mapItems, candidateItems]);

  // Level-of-detail: aggregate all shown points into shaded regions / city dots when zoomed
  // out, scatter individual pins when zoomed in. Tier is driven by the live map zoom + bounds.
  const [view, setView] = useState<{ zoom: number; bounds: ZCBounds | null }>({ zoom: 13, bounds: null });
  const handleView = useCallback((zoom: number, bounds: ZCBounds | null) => setView({ zoom, bounds }), []);
  useEffect(() => { onZoomChange?.(view.zoom); }, [view.zoom, onZoomChange]);
  const clusterPoints = useMemo<ClusterPoint[]>(
    () => [...mapItems, ...candidateItems].map(m => ({ id: m.id, lat: m.latLng.lat, lng: m.latLng.lng, label: (m as any).area })),
    [mapItems, candidateItems],
  );
  const cluster = useMemo(
    () => zoomCluster(clusterPoints, view.zoom, view.bounds, { cityZoom: CITY_ZOOM, pinZoom: PIN_ZOOM }),
    [clusterPoints, view],
  );
  const isPins = cluster.tier === 'pins';

  // If the user has not pasted their active key, present a beautiful layout guide
  if (!hasValidKey) {
    return (
      <section className="flex-1 bg-white border border-border-subtle rounded-[8px] overflow-hidden relative shadow-sm flex flex-col min-h-[220px]">
        <div className="flex-1 bg-[#F7F6F2] relative overflow-hidden flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-6 rounded-[8px] border border-dashed border-slate-300 shadow-sm text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4 text-blue-600">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-[15px] font-bold text-[#36453F] mb-2">Google Maps Key Needed</h2>
            <p className="text-xs text-[#6A7470] mb-4 leading-relaxed">
              Connect this Kyoto travel dashboard to a live, interactive Google Maps display to view exact locations, pin drops, and relative distances!
            </p>

            <div className="text-left bg-[#F7F6F2] p-4 rounded-[8px] border border-slate-200 text-xs text-[#6A7470] leading-normal mb-4 flex flex-col gap-2.5">
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
            <p className="text-[10px] text-[#6A7470] italic">
              *The app re-compiles automatically after adding your key. No reload required.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 bg-white border border-border-subtle rounded-[8px] overflow-hidden relative shadow-sm flex flex-col min-h-[220px]">
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

          {/* Level-of-detail: track zoom/bounds, and draw shaded regions + count dots when zoomed out */}
          <ZoomTracker onChange={handleView} />
          <AggregationLayer result={cluster} />

          {/* Chronological lines between stops removed on user request */}

          {/* Active itinerary points on the map (in-city scatter only; aggregated tiers use AggregationLayer) */}
          {isPins && mapItems.map((item) => {
            const isSelected = selectedItemId === item.id;
            const isHovered = hoveredItemId === item.id;
            const CAT_COLORS: Record<string, { border: string; text: string; tint: string }> = {
              sight:   { border: '#4A76A8', text: '#355888', tint: '#EAF0F8' },
              food:    { border: '#A06820', text: '#8A5A12', tint: '#F8EEDC' },
              stay:    { border: '#7A5068', text: '#5C3E4D', tint: '#F1E9EE' },
              transit: { border: '#4E6B57', text: '#2F5D3A', tint: '#E7F3EA' },
              booking: { border: '#B0532E', text: '#8A3A2E', tint: '#F8EDEA' },
            };
            const catStyle = CAT_COLORS[item.category] ?? { border: '#8A9490', text: '#6A7470', tint: '#EDEBE7' };

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
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-[3px] shadow-lg transition-all duration-150 ${
                      isSelected ? 'scale-110' : isHovered ? 'scale-110' : 'hover:scale-105'
                    }`}
                    style={{
                      borderColor: catStyle.border,
                      color: catStyle.text,
                      backgroundColor: isSelected ? catStyle.tint : '#FFFFFF',
                    }}
                  >
                    {item.indexOrder}
                  </div>
                </div>
              </AdvancedMarker>
            );
          })}

          {/* Saved pocket candidates — faint until selected, for spatial context (scatter only) */}
          {isPins && candidateItems.map((item) => {
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
                    <div className={`absolute inset-0 w-8 h-8 rounded-full ${isFood ? 'bg-orange-500/20' : 'bg-blue-500/20'}`} />
                  )}
                  <div
                    className={`rounded-full flex items-center justify-center shadow-md transition-all duration-150 ${
                      isSelected
                        ? `w-8 h-8 border-2 scale-110 ${isFood ? 'bg-orange-500 text-white border-white' : 'bg-blue-600 text-white border-white'}`
                        : `w-6 h-6 border border-dashed bg-white/90 hover:scale-110 hover:bg-white ${isFood ? 'text-orange-500 border-orange-300' : 'text-[#6A7470] border-slate-300'}`
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
              <div className="p-1 min-w-[180px] max-w-[260px] text-[#36453F]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${selectedItem.category === 'food' ? 'bg-orange-500' : 'bg-blue-500'}`} />
                  <h3 className="font-bold text-xs tracking-tight text-[#36453F]">{selectedItem.title}</h3>
                </div>
                <p className="text-[10px] text-[#6A7470] font-medium mb-1">{selectedItem.area}</p>

                {selectedItem.openingHours && (
                  <p className="text-[9px] text-[#6A7470]">Hours: {selectedItem.openingHours}</p>
                )}
                {selectedItem.startTime && (
                  <p className="text-[9px] text-[#6A7470] font-medium">Scheduled: {selectedItem.startTime} - {selectedItem.endTime}</p>
                )}
                {selectedItem.note && (
                  <p className="text-[9px] bg-[#F7F6F2] text-[#6A7470] p-1 rounded border border-[#E4E2DE] mt-1 italic leading-normal">
                    "{selectedItem.note}"
                  </p>
                )}
              </div>
            </InfoWindow>
          )}
        </Map>

        {mapItems.length === 0 && candidateItems.length === 0 && (
          <div className="absolute inset-x-0 bottom-4 mx-auto max-w-[220px] bg-white border border-border-subtle rounded-[8px] text-center py-1.5 px-3 shadow-md text-xs text-[#6A7470] font-medium pointer-events-none z-10">
            Leisure day – map centered on Kyoto
          </div>
        )}
      </div>
    </section>
  );
}
